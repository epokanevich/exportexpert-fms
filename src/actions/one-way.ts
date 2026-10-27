"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { businessToday, latestBusinessDate } from "@/lib/business-time";
import { computeDeadline, computeTripTiming } from "@/lib/domain/one-way";
import { locodeCity } from "@/lib/domain/constants";
import { issueBlockReason } from "@/lib/domain/container";
import { formatBic } from "@/lib/iso6346";
import { formatDate, formatUsd } from "@/lib/format";
import { startOfDayUtc } from "@/lib/dates";
import { actorOf, authorize, ConflictError, dateField, innField, locodeField, moneyField, optionalMoneyField, notFound, optionalText, parseInput, requiredText, serverError } from "./helpers";
import type { ActionResult } from "./types";

const createTripSchema = z.object({
  containerId: z.string().min(1, "Выберите контейнер"),
  counterpartyName: requiredText("контрагент", 200),
  counterpartyInn: innField,
  counterpartyContact: optionalText(200),
  bookingRef: requiredText("номер заявки/договора", 60),
  dropoffLocode: locodeField,
  dropoffTerminal: requiredText("депо возврата", 120),
  handoverDate: dateField,
  freeDays: z.coerce.number().int().min(1, "Минимум 1 день").max(365, "Не более 365 дней"),
  feeUsd: moneyField,
  detentionRatePerDayUsd: moneyField,
  notes: optionalText(1000),
});

export type CreateTripInput = z.input<typeof createTripSchema>;

export async function createOneWayAction(input: CreateTripInput): Promise<ActionResult> {
  const auth = await authorize("operations:manage");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(createTripSchema, input);
  if (!parsed.ok) return parsed.result;
  const data = parsed.data;

  const container = await prisma.container.findUnique({ where: { id: data.containerId } });
  if (!container) return notFound("Контейнер");
  const blockReason = issueBlockReason(container, businessToday());
  if (blockReason) {
    return { ok: false, error: `${formatBic(container.bicCode)}: выдача запрещена — ${blockReason}`, fieldErrors: { containerId: blockReason } };
  }

  const deadline = computeDeadline(data.handoverDate, data.freeDays);
  try {
    const trip = await prisma.$transaction(async (tx) => {
      // Захват контейнера условием «ещё на стоке»: параллельная выдача того же контейнера получит count = 0.
      const claimed = await tx.container.updateMany({
        where: { id: container.id, operationalStatus: "AVAILABLE" },
        data: { operationalStatus: "ONE_WAY", currentTerminal: `Выдан: ${data.counterpartyName}`, storageStartDate: null, totalRevenueUsd: { increment: data.feeUsd } },
      });
      if (claimed.count === 0) throw new ConflictError(`${formatBic(container.bicCode)} уже выдан или снят со стока — обновите страницу`);
      const created = await tx.oneWayTrip.create({
        data: {
          containerId: container.id,
          counterpartyName: data.counterpartyName,
          counterpartyInn: data.counterpartyInn,
          counterpartyContact: data.counterpartyContact,
          bookingRef: data.bookingRef,
          pickupLocode: container.currentLocode,
          pickupTerminal: container.currentTerminal,
          dropoffLocode: data.dropoffLocode,
          dropoffTerminal: data.dropoffTerminal,
          handoverDate: data.handoverDate,
          freeDays: data.freeDays,
          deadlineDate: deadline,
          feeUsd: data.feeUsd,
          detentionRatePerDayUsd: data.detentionRatePerDayUsd,
          status: "ACTIVE",
          notes: data.notes,
        },
      });
      await tx.containerEvent.create({
        data: {
          containerId: container.id,
          type: "ONE_WAY_OUT",
          occurredAt: new Date(),
          locode: container.currentLocode,
          terminal: container.currentTerminal,
          description: `Gate-Out: выдан в One-Way ${data.bookingRef} контрагенту ${data.counterpartyName}. Возврат: ${locodeCity(data.dropoffLocode)}, ${data.dropoffTerminal} до ${formatDate(deadline)} (${data.freeDays} своб. дней), детеншн ${formatUsd(data.detentionRatePerDayUsd)}/сут.`,
          amountUsd: data.feeUsd || null,
          actor: session.name,
        },
      });
      await audit(tx, { actor: actorOf(session), action: "ONE_WAY_ISSUE", entityType: "OneWayTrip", entityId: created.id, summary: `${formatBic(container.bicCode)} выдан в One-Way ${data.bookingRef} (${data.counterpartyName}) до ${formatDate(deadline)}` });
      return created;
    });
    revalidatePath("/", "layout");
    return { ok: true, message: `${formatBic(container.bicCode)} выдан в One-Way до ${formatDate(deadline)}`, id: trip.id };
  } catch (error) {
    return serverError("one-way", error);
  }
}

const returnSchema = z
  .object({
    returnDate: dateField,
    terminal: requiredText("терминал приёмки", 120),
    condition: z.enum(["SOUND", "DAMAGED"]),
    eorUsd: optionalMoneyField,
    note: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.condition === "DAMAGED" && !v.eorUsd) ctx.addIssue({ code: "custom", path: ["eorUsd"], message: "Укажите оценку ремонта (EOR)" });
  });

export type TripReturnInput = z.input<typeof returnSchema>;

/** Gate-In по One-Way: закрывает рейс, начисляет детеншн, ставит контейнер на сток депо назначения. */
export async function registerOneWayReturnAction(tripId: string, input: TripReturnInput): Promise<ActionResult> {
  const auth = await authorize("operations:manage");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(returnSchema, input);
  if (!parsed.ok) return parsed.result;
  const data = parsed.data;

  const trip = await prisma.oneWayTrip.findUnique({ where: { id: tripId }, include: { container: true } });
  if (!trip) return notFound("Рейс One-Way");
  if (trip.status !== "ACTIVE") return { ok: false, error: "Возврат по этому рейсу уже зафиксирован" };
  if (data.returnDate < startOfDayUtc(trip.handoverDate)) return { ok: false, error: "Дата возврата раньше даты выдачи", fieldErrors: { returnDate: "Раньше даты выдачи" } };
  if (data.returnDate > latestBusinessDate(new Date())) return { ok: false, error: "Дата возврата не может быть в будущем", fieldErrors: { returnDate: "Дата в будущем" } };

  const timing = computeTripTiming({ ...trip, status: "COMPLETED", actualReturnDate: data.returnDate }, businessToday());
  const isDamaged = data.condition === "DAMAGED";
  const detentionNote = timing.overdueDays > 0 ? ` Просрочка ${timing.overdueDays} дн., начислен детеншн ${formatUsd(timing.detentionUsd)}.` : " Возврат в пределах свободных дней.";

  try {
    await prisma.$transaction(async (tx) => {
      // Закрываем рейс условием status = ACTIVE: второй параллельный Gate-In получит count = 0 и не начислит детеншн повторно.
      const closed = await tx.oneWayTrip.updateMany({
        where: { id: trip.id, status: "ACTIVE" },
        data: {
          status: isDamaged ? "DISPUTE" : "COMPLETED",
          actualReturnDate: data.returnDate,
          dropoffTerminal: data.terminal,
          returnCondition: data.condition,
          returnEorUsd: isDamaged ? data.eorUsd : null,
          notes: data.note ?? trip.notes,
        },
      });
      if (closed.count === 0) throw new ConflictError("Возврат по этому рейсу уже зафиксирован");
      await audit(tx, {
        actor: actorOf(session),
        action: "ONE_WAY_RETURN",
        entityType: "OneWayTrip",
        entityId: trip.id,
        summary: `Gate-In ${formatBic(trip.container.bicCode)} по ${trip.bookingRef}: ${isDamaged ? "повреждён, претензия" : "исправен"}, детеншн ${formatUsd(timing.detentionUsd)}`,
        details: { detentionUsd: timing.detentionUsd, overdueDays: timing.overdueDays },
      });
      await tx.container.update({
        where: { id: trip.containerId },
        data: {
          operationalStatus: "AVAILABLE",
          currentLocode: trip.dropoffLocode,
          currentTerminal: data.terminal,
          storageStartDate: data.returnDate,
          techStatus: isDamaged ? "DAMAGED" : trip.container.techStatus,
          conditionGrade: isDamaged ? "DAMAGED" : trip.container.conditionGrade,
          eorAmountUsd: isDamaged ? data.eorUsd : trip.container.eorAmountUsd,
          totalRevenueUsd: { increment: timing.detentionUsd },
          events: {
            create: [
              {
                type: "ONE_WAY_IN",
                occurredAt: new Date(),
                locode: trip.dropoffLocode,
                terminal: data.terminal,
                description: `Gate-In по One-Way ${trip.bookingRef} (${trip.counterpartyName}).${detentionNote}${isDamaged ? ` Повреждение при приёмке, открыта претензия (EOR ${formatUsd(data.eorUsd ?? 0)}).` : " Состояние: исправен."}${data.note ? ` ${data.note}` : ""}`,
                amountUsd: timing.detentionUsd || null,
                actor: session.name,
              },
              ...(isDamaged
                ? [{ type: "INSPECTION", occurredAt: new Date(), locode: trip.dropoffLocode, terminal: data.terminal, description: `Акт осмотра при приёмке: повреждение. EOR ${formatUsd(data.eorUsd ?? 0)}.`, amountUsd: data.eorUsd, actor: session.name }]
                : []),
            ],
          },
        },
      });
    });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `${formatBic(trip.container.bicCode)} принят на ${data.terminal}.${timing.detentionUsd > 0 ? ` Детеншн: ${formatUsd(timing.detentionUsd)}.` : ""}${isDamaged ? " Открыта претензия." : ""}`,
    };
  } catch (error) {
    return serverError("one-way", error);
  }
}

const resolveSchema = z.object({ compensationUsd: moneyField, note: optionalText(500) });

export async function resolveDisputeAction(tripId: string, input: z.input<typeof resolveSchema>): Promise<ActionResult> {
  const auth = await authorize("operations:manage");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(resolveSchema, input);
  if (!parsed.ok) return parsed.result;
  const trip = await prisma.oneWayTrip.findUnique({ where: { id: tripId }, include: { container: { select: { bicCode: true, currentLocode: true, currentTerminal: true } } } });
  if (!trip) return notFound("Рейс One-Way");
  if (trip.status !== "DISPUTE") return { ok: false, error: "По рейсу нет открытой претензии" };

  const { compensationUsd, note } = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      const closed = await tx.oneWayTrip.updateMany({
        where: { id: tripId, status: "DISPUTE" },
        data: { status: "COMPLETED", notes: [trip.notes, `Претензия закрыта: компенсация ${formatUsd(compensationUsd)}. ${note ?? ""}`].filter(Boolean).join("\n") },
      });
      if (closed.count === 0) throw new ConflictError("Претензия уже закрыта");
      await audit(tx, { actor: actorOf(session), action: "ONE_WAY_DISPUTE_RESOLVE", entityType: "OneWayTrip", entityId: tripId, summary: `Претензия ${trip.bookingRef} закрыта, компенсация ${formatUsd(compensationUsd)}` });
      await tx.container.update({
        where: { id: trip.containerId },
        data: {
          totalRevenueUsd: { increment: compensationUsd },
          events: {
            create: {
              type: "STATUS_CHANGE",
              occurredAt: new Date(),
              locode: trip.container.currentLocode,
              terminal: trip.container.currentTerminal,
              description: `Претензия по One-Way ${trip.bookingRef} урегулирована: компенсация ${formatUsd(compensationUsd)} от ${trip.counterpartyName}.${note ? ` ${note}` : ""}`,
              amountUsd: compensationUsd || null,
              actor: session.name,
            },
          },
        },
      });
    });
  } catch (error) {
    return serverError("one-way", error);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Претензия по ${trip.bookingRef} закрыта` };
}
