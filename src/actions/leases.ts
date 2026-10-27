"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { businessToday, latestBusinessDate } from "@/lib/business-time";
import { addMonths, startOfDayUtc } from "@/lib/dates";
import { MAX_LEASE_UNITS, PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, locodeCity } from "@/lib/domain/constants";
import { accrueItem, parseLocodeList } from "@/lib/domain/lease";
import { issueBlockReason } from "@/lib/domain/container";
import { formatBic } from "@/lib/iso6346";
import { formatDate, formatUsd } from "@/lib/format";
import { roundMoney, toDbMoney } from "@/lib/money";
import { actorOf, authorize, ConflictError, dateField, innField, locodeField, moneyField, optionalMoneyField, notFound, optionalText, parseInput, requiredText, serverError } from "./helpers";
import type { ActionResult } from "./types";

const rateField = z.coerce.number({ error: "Введите ставку" }).positive("Ставка должна быть больше 0").max(1000, "Не более $1 000 в сутки");

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
    dailyRateUsd: rateField,
    depositUsd: moneyField,
    allowedReturnLocodes: z.array(locodeField).min(1, "Выберите хотя бы один регион возврата").max(20, "Не более 20 регионов"),
    containerIds: z.array(z.string().min(1)).min(1, "Добавьте хотя бы один контейнер").max(MAX_LEASE_UNITS, `Не более ${MAX_LEASE_UNITS} контейнеров в одном договоре`),
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.endDate <= v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Окончание должно быть позже начала" });
  });

export type CreateLeaseInput = z.input<typeof createLeaseSchema>;

export async function createLeaseAction(input: CreateLeaseInput): Promise<ActionResult> {
  const auth = await authorize("operations:manage");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(createLeaseSchema, input);
  if (!parsed.ok) return parsed.result;
  const data = parsed.data;

  const duplicate = await prisma.leaseContract.findUnique({ where: { contractNumber: data.contractNumber }, select: { id: true } });
  if (duplicate) return { ok: false, error: "Договор с таким номером уже существует", fieldErrors: { contractNumber: "Номер занят" } };

  const uniqueIds = [...new Set(data.containerIds)];
  const containers = await prisma.container.findMany({ where: { id: { in: uniqueIds }, deletedAt: null } });
  const now = new Date();
  if (containers.length !== uniqueIds.length) return { ok: false, error: "Часть контейнеров не найдена — обновите страницу" };
  const blocked = containers.map((c) => ({ c, reason: issueBlockReason(c, businessToday(now)) })).filter((x) => x.reason !== null);
  if (blocked.length > 0) {
    return {
      ok: false,
      error: `Выдача в аренду запрещена: ${blocked.map((x) => `${formatBic(x.c.bicCode)} — ${x.reason}`).join("; ")}`,
      fieldErrors: { containerIds: "Есть заблокированные контейнеры" },
    };
  }

  // D-19: договор с будущей датой On-Hire — SCHEDULED, контейнеры в резерве. «В аренде» они станут в дату On-Hire.
  const isScheduled = data.startDate > businessToday(now);
  const rate = toDbMoney(data.dailyRateUsd);

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
          dailyRateUsd: rate,
          depositUsd: toDbMoney(data.depositUsd),
          paymentStatus: "PENDING",
          allowedReturnLocodes: data.allowedReturnLocodes.join(","),
          onHireSurvey: isScheduled ? "PENDING" : "SIGNED",
          offHireSurvey: "NOT_STARTED",
          status: isScheduled ? "SCHEDULED" : "ACTIVE",
          notes: data.notes,
          items: { create: containers.map((c) => ({ containerId: c.id, onHireDate: data.startDate })) },
          ratePeriods: { create: { effectiveFrom: data.startDate, dailyRateUsd: rate } },
        },
      });
      for (const c of containers) {
        // Захват условием «ещё на стоке»: контейнер, параллельно выданный в другой договор/рейс, откатит всю транзакцию.
        const claimed = await tx.container.updateMany({
          where: { id: c.id, operationalStatus: "AVAILABLE", deletedAt: null },
          data: {
            operationalStatus: isScheduled ? "RESERVED" : "LONG_TERM_LEASE",
            currentTerminal: isScheduled ? `Резерв: ${data.lesseeName}` : `В аренде: ${data.lesseeName}`,
            storageStartDate: isScheduled ? c.storageStartDate : null,
          },
        });
        if (claimed.count === 0) throw new ConflictError(`${formatBic(c.bicCode)} уже выдан или снят со стока — обновите страницу`);
        await tx.containerEvent.create({
          data: {
            containerId: c.id,
            type: isScheduled ? "STATUS_CHANGE" : "LEASE_ON_HIRE",
            occurredAt: now,
            locode: c.currentLocode,
            terminal: c.currentTerminal,
            description: isScheduled
              ? `Зарезервирован под договор аренды ${data.contractNumber} (${data.lesseeName}): On-Hire ${formatDate(data.startDate)}, Per Diem ${formatUsd(data.dailyRateUsd, 2)}.`
              : `On-Hire: передан в аренду ${data.lesseeName} по договору ${data.contractNumber} (с ${formatDate(data.startDate)} по ${formatDate(data.endDate)}), Per Diem ${formatUsd(data.dailyRateUsd, 2)}. On-Hire Survey подписан.`,
            actor: session.name,
          },
        });
      }
      await audit(tx, {
        actor: actorOf(session),
        action: "LEASE_CREATE",
        entityType: "LeaseContract",
        entityId: created.id,
        summary: `Договор ${data.contractNumber} (${data.lesseeName}): ${containers.length} ед., ${formatUsd(data.dailyRateUsd, 2)}/сут.${isScheduled ? `, On-Hire ${formatDate(data.startDate)}` : ""}`,
      });
      return created;
    });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: isScheduled
        ? `Договор ${data.contractNumber} оформлен: ${containers.length} ед. в резерве до On-Hire ${formatDate(data.startDate)}`
        : `Договор ${data.contractNumber} оформлен: ${containers.length} ед.`,
      id: lease.id,
    };
  } catch (error) {
    return serverError("leases", error);
  }
}

const extendSchema = z.object({
  months: z.coerce.number({ error: "Введите число месяцев" }).int("Целое число месяцев").min(1, "Минимум 1 месяц").max(60, "Не более 60 месяцев"),
  newDailyRateUsd: z.union([rateField, z.literal("").transform(() => null), z.null()]).optional().transform((v) => v ?? null),
  rateEffectiveFrom: z.union([dateField, z.literal("").transform(() => null), z.null()]).optional().transform((v) => v ?? null),
});

/**
 * Продление договора. Новая ставка (если задана) действует с rateEffectiveFrom (по умолчанию — сегодня):
 * создаётся период LeaseRatePeriod, уже начисленные дни считаются по прежней ставке (D-08).
 */
export async function extendLeaseAction(leaseId: string, input: z.input<typeof extendSchema>): Promise<ActionResult> {
  const auth = await authorize("operations:manage");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(extendSchema, input);
  if (!parsed.ok) return parsed.result;
  const lease = await prisma.leaseContract.findUnique({
    where: { id: leaseId },
    include: { items: { where: { offHireDate: null }, include: { container: true } }, ratePeriods: true },
  });
  if (!lease) return notFound("Договор");
  if (lease.status === "COMPLETED") return { ok: false, error: "Договор уже закрыт" };

  const { months, newDailyRateUsd } = parsed.data;
  const today = businessToday();
  const newEnd = addMonths(lease.endDate, months);
  const rateChanges = newDailyRateUsd !== null && roundMoney(newDailyRateUsd) !== lease.dailyRateUsd;
  const effectiveFrom = parsed.data.rateEffectiveFrom ?? (lease.startDate > today ? startOfDayUtc(lease.startDate) : today);
  if (rateChanges) {
    if (effectiveFrom < today) {
      return { ok: false, error: "Новая ставка не может действовать задним числом: начисленные дни не пересчитываются", fieldErrors: { rateEffectiveFrom: "Не раньше сегодняшнего дня" } };
    }
    if (effectiveFrom < startOfDayUtc(lease.startDate) || effectiveFrom > newEnd) {
      return { ok: false, error: "Дата новой ставки должна быть в пределах срока договора", fieldErrors: { rateEffectiveFrom: "Вне срока договора" } };
    }
  }
  const rate = rateChanges ? toDbMoney(newDailyRateUsd) : null;
  const rateNote = rate ? ` Новая ставка Per Diem ${formatUsd(newDailyRateUsd ?? 0, 2)} с ${formatDate(effectiveFrom)} (до этой даты — ${formatUsd(lease.dailyRateUsd, 2)}).` : "";

  try {
    await prisma.$transaction(async (tx) => {
      // Под блокировкой перечитываем статус: договор мог закрыть параллельный Off-Hire.
      const status = await lockLease(tx, leaseId);
      if (status === "COMPLETED") throw new ConflictError("Договор уже закрыт — обновите страницу");
      if (rate) {
        await tx.leaseRatePeriod.upsert({
          where: { leaseId_effectiveFrom: { leaseId, effectiveFrom } },
          create: { leaseId, effectiveFrom, dailyRateUsd: rate },
          update: { dailyRateUsd: rate },
        });
      }
      await tx.leaseContract.update({
        where: { id: leaseId },
        data: { endDate: newEnd, offHireSurvey: "NOT_STARTED", ...(rate ? { dailyRateUsd: rate } : {}) },
      });
      await audit(tx, {
        actor: actorOf(session),
        action: "LEASE_EXTEND",
        entityType: "LeaseContract",
        entityId: leaseId,
        summary: `${lease.contractNumber} продлён на ${months} мес. до ${formatDate(newEnd)}.${rateNote}`,
        details: rate ? { newRateUsd: rate, effectiveFrom: effectiveFrom.toISOString().slice(0, 10) } : undefined,
      });
      if (lease.items.length > 0) {
        await tx.containerEvent.createMany({
          data: lease.items.map((item) => ({
            containerId: item.containerId,
            type: "LEASE_EXTENDED",
            occurredAt: new Date(),
            locode: item.container.currentLocode,
            terminal: item.container.currentTerminal,
            description: `Договор ${lease.contractNumber} продлён на ${months} мес. до ${formatDate(newEnd)}.${rateNote}`,
            actor: session.name,
          })),
        });
      }
    });
  } catch (error) {
    return serverError("leases", error);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Договор ${lease.contractNumber} продлён до ${formatDate(newEnd)}.${rateNote}` };
}

/** Блокирует строку договора до конца транзакции (SELECT … FOR UPDATE) и возвращает его текущий статус. */
async function lockLease(tx: AppTransaction, leaseId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "LeaseContract" WHERE id = ${leaseId} FOR UPDATE`;
  return rows[0]?.status ?? null;
}

const offHireSchema = z
  .object({
    itemIds: z.array(z.string().min(1)).min(1, "Выберите контейнеры для возврата").max(MAX_LEASE_UNITS, `Не более ${MAX_LEASE_UNITS} контейнеров за раз`),
    returnDate: dateField,
    returnLocode: locodeField,
    terminal: requiredText("депо возврата", 120),
    condition: z.enum(["SOUND", "DAMAGED"]),
    eorUsd: optionalMoneyField,
  })
  .superRefine((v, ctx) => {
    if (v.condition === "DAMAGED" && !v.eorUsd) ctx.addIssue({ code: "custom", path: ["eorUsd"], message: "Укажите оценку ремонта (EOR)" });
  });

export type OffHireInput = z.input<typeof offHireSchema>;

export async function offHireAction(leaseId: string, input: OffHireInput): Promise<ActionResult> {
  const auth = await authorize("operations:manage");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(offHireSchema, input);
  if (!parsed.ok) return parsed.result;
  const data = parsed.data;

  const lease = await prisma.leaseContract.findUnique({ where: { id: leaseId }, include: { items: { include: { container: true } }, ratePeriods: true } });
  if (!lease) return notFound("Договор");
  if (lease.status === "SCHEDULED") return { ok: false, error: "Дата On-Hire по договору ещё не наступила — возвращать нечего" };
  if (!parseLocodeList(lease.allowedReturnLocodes).includes(data.returnLocode)) {
    return { ok: false, error: `${locodeCity(data.returnLocode)} не входит в разрешённые регионы возврата`, fieldErrors: { returnLocode: "Не разрешено договором" } };
  }
  const requested = new Set(data.itemIds);
  const items = lease.items.filter((i) => requested.has(i.id) && !i.offHireDate);
  if (items.length !== requested.size) return { ok: false, error: "Часть контейнеров уже возвращена или не относится к договору" };
  if (items.some((i) => data.returnDate < startOfDayUtc(i.onHireDate))) return { ok: false, error: "Дата возврата раньше даты On-Hire", fieldErrors: { returnDate: "Раньше On-Hire" } };
  if (data.returnDate > latestBusinessDate()) return { ok: false, error: "Дата возврата не может быть в будущем", fieldErrors: { returnDate: "Дата в будущем" } };

  let remaining = lease.items.filter((i) => !i.offHireDate).length - items.length;
  const isDamaged = data.condition === "DAMAGED";
  const periods = lease.ratePeriods.length > 0 ? lease.ratePeriods : [{ effectiveFrom: lease.startDate, dailyRateUsd: lease.dailyRateUsd }];

  try {
    await prisma.$transaction(async (tx) => {
      await lockLease(tx, leaseId);
      for (const item of items) {
        const accrual = accrueItem({ onHireDate: item.onHireDate, offHireDate: data.returnDate }, periods, item.onHireDate, data.returnDate);
        const breakdown = accrual.segments.map((s) => `${s.days} сут. × ${formatUsd(s.rateUsd, 2)}`).join(" + ");
        // Условие offHireDate = null: единица, уже возвращённая параллельным запросом, не принесёт выручку повторно.
        const returned = await tx.leaseItem.updateMany({ where: { id: item.id, offHireDate: null }, data: { offHireDate: data.returnDate, returnLocode: data.returnLocode } });
        if (returned.count === 0) throw new ConflictError("Часть контейнеров уже возвращена — обновите страницу");
        await tx.container.update({
          where: { id: item.containerId },
          data: {
            operationalStatus: "AVAILABLE",
            currentLocode: data.returnLocode,
            currentTerminal: data.terminal,
            storageStartDate: data.returnDate,
            techStatus: isDamaged ? "DAMAGED" : item.container.techStatus,
            conditionGrade: isDamaged ? "DAMAGED" : item.container.conditionGrade,
            eorAmountUsd: isDamaged && data.eorUsd !== null ? toDbMoney(data.eorUsd) : item.container.eorAmountUsd,
            totalRevenueUsd: { increment: toDbMoney(accrual.amountUsd) },
            events: {
              create: {
                type: "LEASE_OFF_HIRE",
                occurredAt: new Date(),
                locode: data.returnLocode,
                terminal: data.terminal,
                description: `Off-Hire по договору ${lease.contractNumber}: возвращен на ${data.terminal} (${locodeCity(data.returnLocode)}). Аренда ${breakdown || "0 сут."} = ${formatUsd(accrual.amountUsd, 2)}. Off-Hire Survey: ${isDamaged ? `повреждение, EOR ${formatUsd(data.eorUsd ?? 0)}` : "без замечаний"}.`,
                amountUsd: toDbMoney(accrual.amountUsd),
                actor: session.name,
              },
            },
          },
        });
      }
      // Остаток — по зафиксированным данным под блокировкой договора: параллельный Off-Hire других единиц
      // того же договора уже учтён, поэтому последний возврат гарантированно закрывает договор.
      const stillOnHire = await tx.leaseItem.count({ where: { leaseId, offHireDate: null } });
      await tx.leaseContract.update({
        where: { id: leaseId },
        data: stillOnHire === 0 ? { status: "COMPLETED", offHireSurvey: "SIGNED" } : { offHireSurvey: "PENDING" },
      });
      remaining = stillOnHire;
      await audit(tx, {
        actor: actorOf(session),
        action: "LEASE_OFF_HIRE",
        entityType: "LeaseContract",
        entityId: leaseId,
        summary: `Off-Hire по ${lease.contractNumber}: ${items.length} ед. на ${data.terminal}${remaining === 0 ? ", договор закрыт" : ""}`,
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
  const auth = await authorize("operations:manage");
  if (!auth.ok) return auth.result;
  const parsed = parseInput(paymentSchema, input);
  if (!parsed.ok) return parsed.result;
  const lease = await prisma.leaseContract.findUnique({ where: { id: leaseId }, select: { id: true, contractNumber: true } });
  if (!lease) return notFound("Договор");
  await prisma.$transaction(async (tx) => {
    await tx.leaseContract.update({ where: { id: leaseId }, data: { paymentStatus: parsed.data.paymentStatus } });
    await audit(tx, { actor: actorOf(auth.session), action: "LEASE_PAYMENT_STATUS", entityType: "LeaseContract", entityId: leaseId, summary: `${lease.contractNumber}: оплата — «${PAYMENT_STATUS_LABELS[parsed.data.paymentStatus]}»` });
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `${lease.contractNumber}: статус оплаты — «${PAYMENT_STATUS_LABELS[parsed.data.paymentStatus]}»` };
}
