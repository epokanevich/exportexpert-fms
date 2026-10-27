"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { CONDITION_GRADES, CONDITION_GRADE_LABELS, TECH_STATUSES, TECH_STATUS_LABELS, locodeCity } from "@/lib/domain/constants";
import { formatBic } from "@/lib/iso6346";
import { issueBlockReason } from "@/lib/domain/container";
import { formatDate, formatUsd } from "@/lib/format";
import { actorOf, authorize, ConflictError, dateField, locodeField, moneyField, optionalMoneyField, notFound, optionalText, parseInput, requiredText, serverError } from "./helpers";
import { damageLineSchema, describeDamage, eorFromDamages, MAX_DAMAGE_LINES } from "@/lib/domain/damage";
import { toDbMoney } from "@/lib/money";
import type { ActionResult } from "./types";
import { businessToday } from "@/lib/business-time";

const inspectionSchema = z
  .object({
    conditionGrade: z.enum(CONDITION_GRADES),
    techStatus: z.enum(TECH_STATUSES),
    eorUsd: optionalMoneyField,
    comment: optionalText(1000),
    damages: z.array(damageLineSchema).max(MAX_DAMAGE_LINES, `Не более ${MAX_DAMAGE_LINES} строк повреждений`).optional().default([]),
  })
  .transform((v) => ({ ...v, eorUsd: v.eorUsd ?? eorFromDamages(v.damages) }))
  .superRefine((v, ctx) => {
    if ((v.techStatus === "DAMAGED" || v.techStatus === "IN_REPAIR") && !v.eorUsd) {
      ctx.addIssue({ code: "custom", path: ["eorUsd"], message: "Для повреждённого контейнера укажите EOR или стоимость по строкам повреждений" });
    }
    if (v.techStatus === "SOUND" && v.conditionGrade === "DAMAGED") {
      ctx.addIssue({ code: "custom", path: ["conditionGrade"], message: "Исправный контейнер не может иметь грейд «Damaged»" });
    }
  });

export type InspectionInput = z.input<typeof inspectionSchema>;

/**
 * Акт осмотра: фиксирует грейд, тех. статус и строки повреждений CEDEX. Переходы:
 *  → IN_REPAIR: контейнер уходит в ремзону (MAINTENANCE);
 *  IN_REPAIR/DAMAGED → SOUND: ремонт закрыт, EOR списывается в затраты на ремонт, открытые повреждения — REPAIRED,
 *  контейнер возвращается на сток.
 */
export async function inspectContainerAction(containerId: string, input: InspectionInput): Promise<ActionResult> {
  const auth = await authorize("inspection");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(inspectionSchema, input);
  if (!parsed.ok) return parsed.result;
  const data = parsed.data;
  const c = await prisma.container.findUnique({ where: { id: containerId } });
  if (!c) return notFound("Контейнер");
  if (c.deletedAt) return { ok: false, error: "Контейнер списан — операции недоступны" };

  const now = new Date();
  const wasBroken = c.techStatus === "DAMAGED" || c.techStatus === "IN_REPAIR";
  const repairCompleted = wasBroken && data.techStatus === "SOUND";
  const repairStarted = data.techStatus === "IN_REPAIR" && c.techStatus !== "IN_REPAIR";
  const onSite = c.operationalStatus === "AVAILABLE" || c.operationalStatus === "MAINTENANCE";
  const repairCost = repairCompleted ? (c.eorAmountUsd ?? 0) : 0;
  const damageNote = data.damages.length > 0 ? ` Повреждения (CEDEX): ${data.damages.map(describeDamage).join("; ")}.` : "";

  let operationalStatus = c.operationalStatus;
  if (repairStarted && onSite) operationalStatus = "MAINTENANCE";
  if (repairCompleted && c.operationalStatus === "MAINTENANCE") operationalStatus = "AVAILABLE";
  const at = { occurredAt: now, locode: c.currentLocode, terminal: c.currentTerminal, actor: session.name };

  try {
    await prisma.$transaction(async (tx) => {
      // Условие «техстатус не изменился»: параллельный акт не закроет ремонт и не спишет EOR в затраты дважды.
      const claimed = await tx.container.updateMany({
        where: { id: containerId, techStatus: c.techStatus, deletedAt: null },
        data: {
          conditionGrade: data.conditionGrade,
          techStatus: data.techStatus,
          eorAmountUsd: data.techStatus === "SOUND" || data.eorUsd === null ? null : toDbMoney(data.eorUsd),
          operationalStatus,
          storageStartDate: operationalStatus === "AVAILABLE" ? (c.operationalStatus === "AVAILABLE" ? c.storageStartDate : businessToday(now)) : null,
          totalRepairCostUsd: { increment: toDbMoney(repairCost) },
        },
      });
      if (claimed.count === 0) throw new ConflictError("Состояние контейнера изменил другой акт — обновите страницу");
      await audit(tx, {
        actor: actorOf(session),
        action: "INSPECTION",
        entityType: "Container",
        entityId: containerId,
        summary: `${formatBic(c.bicCode)}: акт осмотра — ${TECH_STATUS_LABELS[data.techStatus]}, грейд ${data.conditionGrade}${data.eorUsd ? `, EOR ${formatUsd(data.eorUsd)}` : ""}${data.damages.length ? `, строк повреждений: ${data.damages.length}` : ""}`,
      });
      const inspection = await tx.containerEvent.create({
        data: {
          ...at,
          containerId,
          type: "INSPECTION",
          description: `Акт осмотра: грейд ${CONDITION_GRADE_LABELS[data.conditionGrade]}, тех. статус «${TECH_STATUS_LABELS[data.techStatus]}».${data.eorUsd ? ` EOR ${formatUsd(data.eorUsd)}.` : ""}${damageNote}${data.comment ? ` ${data.comment}` : ""}`,
          amountUsd: data.eorUsd === null ? null : toDbMoney(data.eorUsd),
        },
      });
      if (data.damages.length > 0) {
        await tx.damageItem.createMany({
          data: data.damages.map((d) => ({ ...d, containerId, eventId: inspection.id, costUsd: d.costUsd === null ? null : toDbMoney(d.costUsd) })),
        });
      }
      if (repairStarted) {
        await tx.containerEvent.create({ data: { ...at, containerId, type: "REPAIR_START", description: `Передан в ремонт по EOR ${formatUsd(data.eorUsd ?? 0)}.`, amountUsd: data.eorUsd === null ? null : toDbMoney(data.eorUsd) } });
      }
      if (repairCompleted) {
        const repaired = await tx.damageItem.updateMany({ where: { containerId, status: "OPEN" }, data: { status: "REPAIRED", repairedAt: now } });
        await tx.containerEvent.create({
          data: { ...at, containerId, type: "REPAIR_DONE", description: `Ремонт завершён, затраты ${formatUsd(repairCost)}.${repaired.count > 0 ? ` Закрыто строк повреждений: ${repaired.count}.` : ""} Контейнер исправен.`, amountUsd: repairCost ? toDbMoney(repairCost) : null },
        });
      }
    });
  } catch (error) {
    return serverError("inspector", error);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `${formatBic(c.bicCode)}: акт осмотра сохранён${repairCompleted ? ", ремонт закрыт" : repairStarted ? ", передан в ремонт" : ""}` };
}

const gateInSchema = z.object({ locode: locodeField, terminal: requiredText("терминал", 120) });

/** Откуда допустим Gate-In на терминал: собственный рейс, перемещение между депо, ремзона. */
const GATE_IN_FROM = ["IN_TRANSIT", "AVAILABLE", "MAINTENANCE"];

/** Gate-In на терминал (прибытие из собственного рейса / перемещение между депо). */
export async function gateInAction(containerId: string, input: z.input<typeof gateInSchema>): Promise<ActionResult> {
  const auth = await authorize("inspection");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(gateInSchema, input);
  if (!parsed.ok) return parsed.result;
  const c = await prisma.container.findUnique({ where: { id: containerId } });
  if (!c) return notFound("Контейнер");
  if (c.deletedAt) return { ok: false, error: "Контейнер списан — операции недоступны" };
  if (!GATE_IN_FROM.includes(c.operationalStatus)) {
    return { ok: false, error: "Возврат из One-Way или аренды оформляется в соответствующем модуле" };
  }
  const { locode, terminal } = parsed.data;
  const now = new Date();
  const nextStatus = c.techStatus === "IN_REPAIR" ? "MAINTENANCE" : "AVAILABLE";
  try {
    await prisma.$transaction(async (tx) => {
      // Захват условием по статусу: параллельная выдача в One-Way/аренду не будет перезаписана Gate-In'ом.
      const claimed = await tx.container.updateMany({
        where: { id: containerId, deletedAt: null, operationalStatus: { in: GATE_IN_FROM } },
        data: { operationalStatus: nextStatus, currentLocode: locode, currentTerminal: terminal, storageStartDate: nextStatus === "AVAILABLE" ? businessToday(now) : null },
      });
      if (claimed.count === 0) throw new ConflictError(`${formatBic(c.bicCode)}: статус изменился — обновите страницу`);
      await tx.containerEvent.create({
        data: { containerId, type: "GATE_IN", occurredAt: now, locode, terminal, description: `Gate-In: принят на ${terminal} (${locodeCity(locode)}).`, actor: session.name },
      });
      await audit(tx, { actor: actorOf(session), action: "GATE_IN", entityType: "Container", entityId: containerId, summary: `${formatBic(c.bicCode)}: Gate-In на ${terminal} (${locodeCity(locode)})` });
    });
  } catch (error) {
    return serverError("inspector", error);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `${formatBic(c.bicCode)}: Gate-In на ${terminal}` };
}

const gateOutSchema = z.object({ destinationLocode: locodeField, note: optionalText(300) });

/** Gate-Out в собственный рейс. */
export async function gateOutAction(containerId: string, input: z.input<typeof gateOutSchema>): Promise<ActionResult> {
  const auth = await authorize("inspection");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(gateOutSchema, input);
  if (!parsed.ok) return parsed.result;
  const c = await prisma.container.findUnique({ where: { id: containerId } });
  if (!c) return notFound("Контейнер");
  const now = new Date();
  const blockReason = issueBlockReason(c, businessToday(now));
  if (blockReason) return { ok: false, error: `Gate-Out запрещён: ${blockReason}` };
  const { destinationLocode, note } = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      // Как при выдаче в One-Way: контейнер захватывается, только если он ещё на стоке.
      const claimed = await tx.container.updateMany({
        where: { id: containerId, deletedAt: null, operationalStatus: "AVAILABLE" },
        data: { operationalStatus: "IN_TRANSIT", currentTerminal: `В пути: ${c.currentTerminal} → ${locodeCity(destinationLocode)}`, storageStartDate: null },
      });
      if (claimed.count === 0) throw new ConflictError(`${formatBic(c.bicCode)} уже выдан или снят со стока — обновите страницу`);
      await tx.containerEvent.create({
        data: {
          containerId,
          type: "GATE_OUT",
          occurredAt: now,
          locode: c.currentLocode,
          terminal: c.currentTerminal,
          description: `Gate-Out: собственный рейс ${locodeCity(c.currentLocode)} → ${locodeCity(destinationLocode)}.${note ? ` ${note}` : ""}`,
          actor: session.name,
        },
      });
      await audit(tx, { actor: actorOf(session), action: "GATE_OUT", entityType: "Container", entityId: containerId, summary: `${formatBic(c.bicCode)}: Gate-Out в ${locodeCity(destinationLocode)}` });
    });
  } catch (error) {
    return serverError("inspector", error);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `${formatBic(c.bicCode)}: Gate-Out, рейс в ${locodeCity(destinationLocode)}` };
}

const cscSchema = z.object({ cscPlateExpiry: dateField });

export async function renewCscAction(containerId: string, input: z.input<typeof cscSchema>): Promise<ActionResult> {
  const auth = await authorize("inspection");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(cscSchema, input);
  if (!parsed.ok) return parsed.result;
  const c = await prisma.container.findUnique({ where: { id: containerId } });
  if (!c) return notFound("Контейнер");
  if (c.deletedAt) return { ok: false, error: "Контейнер списан — операции недоступны" };
  const { cscPlateExpiry } = parsed.data;
  if (cscPlateExpiry <= businessToday()) return { ok: false, error: "Новая дата должна быть в будущем", fieldErrors: { cscPlateExpiry: "Дата в прошлом" } };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.container.update({ where: { id: containerId }, data: { cscPlateExpiry } });
      await tx.containerEvent.create({
        data: {
          containerId,
          type: "CSC_RENEWAL",
          occurredAt: new Date(),
          locode: c.currentLocode,
          terminal: c.currentTerminal,
          description: `Освидетельствование ACEP пройдено. Табличка КБК (CSC) действительна до ${formatDate(cscPlateExpiry)}.`,
          actor: session.name,
        },
      });
      await audit(tx, { actor: actorOf(session), action: "CSC_RENEWAL", entityType: "Container", entityId: containerId, summary: `${formatBic(c.bicCode)}: КБК продлена до ${formatDate(cscPlateExpiry)}` });
    });
  } catch (error) {
    return serverError("inspector", error);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `${formatBic(c.bicCode)}: КБК продлена до ${formatDate(cscPlateExpiry)}` };
}
