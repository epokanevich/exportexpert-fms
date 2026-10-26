"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/dal";
import { startOfDayUtc } from "@/lib/dates";
import { CONDITION_GRADES, CONDITION_GRADE_LABELS, TECH_STATUSES, TECH_STATUS_LABELS, locodeCity } from "@/lib/domain/constants";
import { formatBic } from "@/lib/iso6346";
import { issueBlockReason } from "@/lib/domain/container";
import { formatDate, formatUsd } from "@/lib/format";
import { dateField, locodeField, moneyField, notFound, optionalText, parseInput, requiredText } from "./helpers";
import type { ActionResult } from "./types";

const inspectionSchema = z
  .object({
    conditionGrade: z.enum(CONDITION_GRADES),
    techStatus: z.enum(TECH_STATUSES),
    eorUsd: z.union([moneyField, z.literal("").transform(() => null), z.null()]).optional().transform((v) => v ?? null),
    comment: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if ((v.techStatus === "DAMAGED" || v.techStatus === "IN_REPAIR") && !v.eorUsd) {
      ctx.addIssue({ code: "custom", path: ["eorUsd"], message: "Для повреждённого контейнера укажите EOR" });
    }
    if (v.techStatus === "SOUND" && v.conditionGrade === "DAMAGED") {
      ctx.addIssue({ code: "custom", path: ["conditionGrade"], message: "Исправный контейнер не может иметь грейд «Damaged»" });
    }
  });

export type InspectionInput = z.input<typeof inspectionSchema>;

/**
 * Акт осмотра: фиксирует грейд и тех. статус. Переходы:
 *  → IN_REPAIR: контейнер уходит в ремзону (MAINTENANCE);
 *  IN_REPAIR/DAMAGED → SOUND: ремонт закрыт, EOR списывается в затраты на ремонт, контейнер возвращается на сток.
 */
export async function inspectContainerAction(containerId: string, input: InspectionInput): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = parseInput(inspectionSchema, input);
  if (!parsed.ok) return parsed.result;
  const data = parsed.data;
  const c = await prisma.container.findUnique({ where: { id: containerId } });
  if (!c) return notFound("Контейнер");

  const now = new Date();
  const wasBroken = c.techStatus === "DAMAGED" || c.techStatus === "IN_REPAIR";
  const repairCompleted = wasBroken && data.techStatus === "SOUND";
  const repairStarted = data.techStatus === "IN_REPAIR" && c.techStatus !== "IN_REPAIR";
  const onSite = c.operationalStatus === "AVAILABLE" || c.operationalStatus === "MAINTENANCE";
  const repairCost = repairCompleted ? (c.eorAmountUsd ?? 0) : 0;

  const events: { type: string; description: string; amountUsd: number | null }[] = [
    {
      type: "INSPECTION",
      description: `Акт осмотра: грейд ${CONDITION_GRADE_LABELS[data.conditionGrade]}, тех. статус «${TECH_STATUS_LABELS[data.techStatus]}».${data.eorUsd ? ` EOR ${formatUsd(data.eorUsd)}.` : ""}${data.comment ? ` ${data.comment}` : ""}`,
      amountUsd: data.eorUsd,
    },
  ];
  if (repairStarted) events.push({ type: "REPAIR_START", description: `Передан в ремонт по EOR ${formatUsd(data.eorUsd ?? 0)}.`, amountUsd: data.eorUsd });
  if (repairCompleted) events.push({ type: "REPAIR_DONE", description: `Ремонт завершён, затраты ${formatUsd(repairCost)}. Контейнер исправен.`, amountUsd: repairCost || null });

  let operationalStatus = c.operationalStatus;
  if (repairStarted && onSite) operationalStatus = "MAINTENANCE";
  if (repairCompleted && c.operationalStatus === "MAINTENANCE") operationalStatus = "AVAILABLE";

  await prisma.container.update({
    where: { id: containerId },
    data: {
      conditionGrade: data.conditionGrade,
      techStatus: data.techStatus,
      eorAmountUsd: data.techStatus === "SOUND" ? null : data.eorUsd,
      operationalStatus,
      storageStartDate: operationalStatus === "AVAILABLE" ? (c.operationalStatus === "AVAILABLE" ? c.storageStartDate : startOfDayUtc(now)) : null,
      totalRepairCostUsd: { increment: repairCost },
      events: {
        create: events.map((e) => ({ ...e, occurredAt: now, locode: c.currentLocode, terminal: c.currentTerminal, actor: session.name })),
      },
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `${formatBic(c.bicCode)}: акт осмотра сохранён${repairCompleted ? ", ремонт закрыт" : repairStarted ? ", передан в ремонт" : ""}` };
}

const gateInSchema = z.object({ locode: locodeField, terminal: requiredText("терминал", 120) });

/** Gate-In на терминал (прибытие из собственного рейса / перемещение между депо). */
export async function gateInAction(containerId: string, input: z.input<typeof gateInSchema>): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = parseInput(gateInSchema, input);
  if (!parsed.ok) return parsed.result;
  const c = await prisma.container.findUnique({ where: { id: containerId } });
  if (!c) return notFound("Контейнер");
  if (c.operationalStatus === "ONE_WAY" || c.operationalStatus === "LONG_TERM_LEASE") {
    return { ok: false, error: "Возврат из One-Way или аренды оформляется в соответствующем модуле" };
  }
  const { locode, terminal } = parsed.data;
  const now = new Date();
  const nextStatus = c.techStatus === "IN_REPAIR" ? "MAINTENANCE" : "AVAILABLE";
  await prisma.container.update({
    where: { id: containerId },
    data: {
      operationalStatus: nextStatus,
      currentLocode: locode,
      currentTerminal: terminal,
      storageStartDate: nextStatus === "AVAILABLE" ? startOfDayUtc(now) : null,
      events: { create: { type: "GATE_IN", occurredAt: now, locode, terminal, description: `Gate-In: принят на ${terminal} (${locodeCity(locode)}).`, actor: session.name } },
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `${formatBic(c.bicCode)}: Gate-In на ${terminal}` };
}

const gateOutSchema = z.object({ destinationLocode: locodeField, note: optionalText(300) });

/** Gate-Out в собственный рейс. */
export async function gateOutAction(containerId: string, input: z.input<typeof gateOutSchema>): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = parseInput(gateOutSchema, input);
  if (!parsed.ok) return parsed.result;
  const c = await prisma.container.findUnique({ where: { id: containerId } });
  if (!c) return notFound("Контейнер");
  const now = new Date();
  const blockReason = issueBlockReason(c, now);
  if (blockReason) return { ok: false, error: `Gate-Out запрещён: ${blockReason}` };
  const { destinationLocode, note } = parsed.data;
  await prisma.container.update({
    where: { id: containerId },
    data: {
      operationalStatus: "IN_TRANSIT",
      currentTerminal: `В пути: ${c.currentTerminal} → ${locodeCity(destinationLocode)}`,
      storageStartDate: null,
      events: {
        create: {
          type: "GATE_OUT",
          occurredAt: now,
          locode: c.currentLocode,
          terminal: c.currentTerminal,
          description: `Gate-Out: собственный рейс ${locodeCity(c.currentLocode)} → ${locodeCity(destinationLocode)}.${note ? ` ${note}` : ""}`,
          actor: session.name,
        },
      },
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `${formatBic(c.bicCode)}: Gate-Out, рейс в ${locodeCity(destinationLocode)}` };
}

const cscSchema = z.object({ cscPlateExpiry: dateField });

export async function renewCscAction(containerId: string, input: z.input<typeof cscSchema>): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = parseInput(cscSchema, input);
  if (!parsed.ok) return parsed.result;
  const c = await prisma.container.findUnique({ where: { id: containerId } });
  if (!c) return notFound("Контейнер");
  const { cscPlateExpiry } = parsed.data;
  if (cscPlateExpiry <= new Date()) return { ok: false, error: "Новая дата должна быть в будущем", fieldErrors: { cscPlateExpiry: "Дата в прошлом" } };
  await prisma.container.update({
    where: { id: containerId },
    data: {
      cscPlateExpiry,
      events: {
        create: {
          type: "CSC_RENEWAL",
          occurredAt: new Date(),
          locode: c.currentLocode,
          terminal: c.currentTerminal,
          description: `Освидетельствование ACEP пройдено. Табличка КБК (CSC) действительна до ${formatDate(cscPlateExpiry)}.`,
          actor: session.name,
        },
      },
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `${formatBic(c.bicCode)}: КБК продлена до ${formatDate(cscPlateExpiry)}` };
}
