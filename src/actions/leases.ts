"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/dal";
import { addMonths, startOfDayUtc } from "@/lib/dates";
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, locodeCity } from "@/lib/domain/constants";
import { parseLocodeList, rentalDaysInRange } from "@/lib/domain/lease";
import { issueBlockReason } from "@/lib/domain/container";
import { formatBic } from "@/lib/iso6346";
import { formatDate, formatUsd } from "@/lib/format";
import { dateField, innField, locodeField, moneyField, notFound, optionalText, parseInput, requiredText, serverError } from "./helpers";
import type { ActionResult } from "./types";

const createLeaseSchema = z
  .object({
    contractNumber: requiredText("номер договора", 40),
    lesseeName: requiredText("арендатор", 200),
    lesseeInn: innField,
    contactPerson: requiredText("контактное лицо", 120),
    contactPhone: optionalText(40),
    contactEmail: z.union([z.literal(""), z.string().trim().email("Некорректный email")]).optional().transform((v) => (v ? v : null)),
    startDate: dateField,
    endDate: dateField,
    autoRenewal: z.boolean(),
    dailyRateUsd: z.coerce.number().positive("Ставка должна быть больше 0").max(1000),
    depositUsd: moneyField,
    allowedReturnLocodes: z.array(locodeField).min(1, "Выберите хотя бы один регион возврата"),
    containerIds: z.array(z.string().min(1)).min(1, "Добавьте хотя бы один контейнер"),
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.endDate <= v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Окончание должно быть позже начала" });
  });

export type CreateLeaseInput = z.input<typeof createLeaseSchema>;

export async function createLeaseAction(input: CreateLeaseInput): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = parseInput(createLeaseSchema, input);
  if (!parsed.ok) return parsed.result;
  const data = parsed.data;

  const duplicate = await prisma.leaseContract.findUnique({ where: { contractNumber: data.contractNumber }, select: { id: true } });
  if (duplicate) return { ok: false, error: "Договор с таким номером уже существует", fieldErrors: { contractNumber: "Номер занят" } };

  const containers = await prisma.container.findMany({ where: { id: { in: data.containerIds } } });
  const now = new Date();
  if (containers.length !== data.containerIds.length) return { ok: false, error: "Часть контейнеров не найдена — обновите страницу" };
  const blocked = containers.map((c) => ({ c, reason: issueBlockReason(c, now) })).filter((x) => x.reason !== null);
  if (blocked.length > 0) {
    return {
      ok: false,
      error: `Выдача в аренду запрещена: ${blocked.map((x) => `${formatBic(x.c.bicCode)} — ${x.reason}`).join("; ")}`,
      fieldErrors: { containerIds: "Есть заблокированные контейнеры" },
    };
  }

  try {
    const lease = await prisma.$transaction(async (tx) => {
      const created = await tx.leaseContract.create({
        data: {
          contractNumber: data.contractNumber,
          lesseeName: data.lesseeName,
          lesseeInn: data.lesseeInn,
          contactPerson: data.contactPerson,
          contactPhone: data.contactPhone,
          contactEmail: data.contactEmail,
          startDate: data.startDate,
          endDate: data.endDate,
          autoRenewal: data.autoRenewal,
          dailyRateUsd: data.dailyRateUsd,
          depositUsd: data.depositUsd,
          paymentStatus: "PENDING",
          allowedReturnLocodes: data.allowedReturnLocodes.join(","),
          onHireSurvey: "SIGNED",
          offHireSurvey: "NOT_STARTED",
          status: "ACTIVE",
          notes: data.notes,
          items: { create: containers.map((c) => ({ containerId: c.id, onHireDate: data.startDate })) },
        },
      });
      for (const c of containers) {
        await tx.container.update({
          where: { id: c.id },
          data: {
            operationalStatus: "LONG_TERM_LEASE",
            currentTerminal: `В аренде: ${data.lesseeName}`,
            storageStartDate: null,
            events: {
              create: {
                type: "LEASE_ON_HIRE",
                occurredAt: new Date(),
                locode: c.currentLocode,
                terminal: c.currentTerminal,
                description: `On-Hire: передан в аренду ${data.lesseeName} по договору ${data.contractNumber} (с ${formatDate(data.startDate)} по ${formatDate(data.endDate)}), Per Diem ${formatUsd(data.dailyRateUsd, 2)}. On-Hire Survey подписан.`,
                actor: session.name,
              },
            },
          },
        });
      }
      return created;
    });
    revalidatePath("/", "layout");
    return { ok: true, message: `Договор ${data.contractNumber} оформлен: ${containers.length} ед.`, id: lease.id };
  } catch (error) {
    return serverError("leases", error);
  }
}

const extendSchema = z.object({
  months: z.coerce.number().int().min(1, "Минимум 1 месяц").max(60, "Не более 60 месяцев"),
  newDailyRateUsd: z.union([z.coerce.number().positive().max(1000), z.literal("").transform(() => null), z.null()]).optional().transform((v) => v ?? null),
});

export async function extendLeaseAction(leaseId: string, input: z.input<typeof extendSchema>): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = parseInput(extendSchema, input);
  if (!parsed.ok) return parsed.result;
  const lease = await prisma.leaseContract.findUnique({ where: { id: leaseId }, include: { items: { where: { offHireDate: null }, include: { container: true } } } });
  if (!lease) return notFound("Договор");
  if (lease.status !== "ACTIVE") return { ok: false, error: "Договор уже закрыт" };

  const { months, newDailyRateUsd } = parsed.data;
  const newEnd = addMonths(lease.endDate, months);
  const rateNote = newDailyRateUsd && newDailyRateUsd !== lease.dailyRateUsd ? `, новая ставка ${formatUsd(newDailyRateUsd, 2)}/сут.` : "";
  await prisma.$transaction([
    prisma.leaseContract.update({
      where: { id: leaseId },
      data: { endDate: newEnd, dailyRateUsd: newDailyRateUsd ?? lease.dailyRateUsd, offHireSurvey: "NOT_STARTED" },
    }),
    prisma.containerEvent.createMany({
      data: lease.items.map((item) => ({
        containerId: item.containerId,
        type: "LEASE_EXTENDED",
        occurredAt: new Date(),
        locode: item.container.currentLocode,
        terminal: item.container.currentTerminal,
        description: `Договор ${lease.contractNumber} продлён на ${months} мес. до ${formatDate(newEnd)}${rateNote}.`,
        actor: session.name,
      })),
    }),
  ]);
  revalidatePath("/", "layout");
  return { ok: true, message: `Договор ${lease.contractNumber} продлён до ${formatDate(newEnd)}` };
}

const offHireSchema = z
  .object({
    itemIds: z.array(z.string().min(1)).min(1, "Выберите контейнеры для возврата"),
    returnDate: dateField,
    returnLocode: locodeField,
    terminal: requiredText("депо возврата", 120),
    condition: z.enum(["SOUND", "DAMAGED"]),
    eorUsd: z.union([moneyField, z.literal("").transform(() => null), z.null()]).optional().transform((v) => v ?? null),
  })
  .superRefine((v, ctx) => {
    if (v.condition === "DAMAGED" && !v.eorUsd) ctx.addIssue({ code: "custom", path: ["eorUsd"], message: "Укажите оценку ремонта (EOR)" });
  });

export type OffHireInput = z.input<typeof offHireSchema>;

export async function offHireAction(leaseId: string, input: OffHireInput): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = parseInput(offHireSchema, input);
  if (!parsed.ok) return parsed.result;
  const data = parsed.data;

  const lease = await prisma.leaseContract.findUnique({ where: { id: leaseId }, include: { items: { include: { container: true } } } });
  if (!lease) return notFound("Договор");
  if (!parseLocodeList(lease.allowedReturnLocodes).includes(data.returnLocode)) {
    return { ok: false, error: `${locodeCity(data.returnLocode)} не входит в разрешённые регионы возврата`, fieldErrors: { returnLocode: "Не разрешено договором" } };
  }
  const items = lease.items.filter((i) => data.itemIds.includes(i.id) && !i.offHireDate);
  if (items.length !== data.itemIds.length) return { ok: false, error: "Часть контейнеров уже возвращена или не относится к договору" };
  if (items.some((i) => data.returnDate < startOfDayUtc(i.onHireDate))) return { ok: false, error: "Дата возврата раньше даты On-Hire", fieldErrors: { returnDate: "Раньше On-Hire" } };
  if (data.returnDate > new Date()) return { ok: false, error: "Дата возврата не может быть в будущем", fieldErrors: { returnDate: "Дата в будущем" } };

  const remaining = lease.items.filter((i) => !i.offHireDate).length - items.length;
  const isDamaged = data.condition === "DAMAGED";

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const rentalDays = rentalDaysInRange({ onHireDate: item.onHireDate, offHireDate: data.returnDate }, item.onHireDate, data.returnDate);
        const earned = rentalDays * lease.dailyRateUsd;
        await tx.leaseItem.update({ where: { id: item.id }, data: { offHireDate: data.returnDate, returnLocode: data.returnLocode } });
        await tx.container.update({
          where: { id: item.containerId },
          data: {
            operationalStatus: "AVAILABLE",
            currentLocode: data.returnLocode,
            currentTerminal: data.terminal,
            storageStartDate: data.returnDate,
            techStatus: isDamaged ? "DAMAGED" : item.container.techStatus,
            conditionGrade: isDamaged ? "DAMAGED" : item.container.conditionGrade,
            eorAmountUsd: isDamaged ? data.eorUsd : item.container.eorAmountUsd,
            totalRevenueUsd: { increment: earned },
            events: {
              create: {
                type: "LEASE_OFF_HIRE",
                occurredAt: new Date(),
                locode: data.returnLocode,
                terminal: data.terminal,
                description: `Off-Hire по договору ${lease.contractNumber}: возвращен на ${data.terminal} (${locodeCity(data.returnLocode)}). Аренда ${rentalDays} сут. × ${formatUsd(lease.dailyRateUsd, 2)} = ${formatUsd(earned)}. Off-Hire Survey: ${isDamaged ? `повреждение, EOR ${formatUsd(data.eorUsd ?? 0)}` : "без замечаний"}.`,
                amountUsd: earned,
                actor: session.name,
              },
            },
          },
        });
      }
      await tx.leaseContract.update({
        where: { id: leaseId },
        data: remaining === 0 ? { status: "COMPLETED", offHireSurvey: "SIGNED" } : { offHireSurvey: "PENDING" },
      });
    });
    revalidatePath("/", "layout");
    return { ok: true, message: `Off-Hire оформлен: ${items.length} ед.${remaining === 0 ? " Договор закрыт." : ` На руках у арендатора: ${remaining}.`}` };
  } catch (error) {
    return serverError("leases", error);
  }
}

const paymentSchema = z.object({ paymentStatus: z.enum(PAYMENT_STATUSES) });

export async function updatePaymentStatusAction(leaseId: string, input: z.input<typeof paymentSchema>): Promise<ActionResult> {
  await requireSession();
  const parsed = parseInput(paymentSchema, input);
  if (!parsed.ok) return parsed.result;
  const lease = await prisma.leaseContract.findUnique({ where: { id: leaseId }, select: { id: true, contractNumber: true } });
  if (!lease) return notFound("Договор");
  await prisma.leaseContract.update({ where: { id: leaseId }, data: { paymentStatus: parsed.data.paymentStatus } });
  revalidatePath("/", "layout");
  return { ok: true, message: `${lease.contractNumber}: статус оплаты — «${PAYMENT_STATUS_LABELS[parsed.data.paymentStatus]}»` };
}
