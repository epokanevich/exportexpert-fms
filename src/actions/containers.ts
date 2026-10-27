"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateBic, formatBic } from "@/lib/iso6346";
import { startOfDayUtc } from "@/lib/dates";
import {
  CONDITION_GRADES,
  MANUAL_EVENT_TYPES,
  OPERATIONAL_STATUSES,
  SIZE_TYPES,
  TECH_STATUSES,
  OPERATIONAL_STATUS_LABELS,
  TECH_STATUS_LABELS,
} from "@/lib/domain/constants";
import { authorize, ConflictError, dateField, locodeField, moneyField, notFound, optionalText, parseInput, requiredText, serverError } from "./helpers";
import type { ActionResult } from "./types";

const baseContainerSchema = z.object({
  bicCode: z.string().trim(),
  sizeType: z.enum(SIZE_TYPES, { error: "Выберите типоразмер" }),
  isoCode: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{4}$/, "ISO-код типа: 4 символа, например 45G1"),
  manufactureYear: z.coerce.number().int().min(1990, "Год не ранее 1990").max(new Date().getUTCFullYear() + 1, "Год из будущего"),
  colorRal: requiredText("цвет RAL", 60),
  manufacturer: requiredText("завод-изготовитель", 120),
  tareWeightKg: z.coerce.number().int().min(500, "Тара от 500 кг").max(15_000),
  maxGrossWeightKg: z.coerce.number().int().min(10_000).max(60_000),
  conditionGrade: z.enum(CONDITION_GRADES),
  techStatus: z.enum(TECH_STATUSES),
  cscPlateExpiry: dateField,
  eorAmountUsd: z.union([moneyField, z.literal("").transform(() => null), z.null()]).optional().transform((v) => v ?? null),
  operationalStatus: z.enum(OPERATIONAL_STATUSES),
  currentLocode: locodeField,
  currentTerminal: requiredText("терминал / депо", 120),
  storageRatePerDayUsd: z.union([moneyField, z.literal("").transform(() => null), z.null()]).optional().transform((v) => v ?? null),
  purchaseDate: dateField,
  purchasePriceUsd: moneyField,
  currentBookValueUsd: moneyField,
  notes: optionalText(1000),
});

const containerSchema = baseContainerSchema.superRefine((value, ctx) => {
  const bic = validateBic(value.bicCode);
  if (!bic.valid) ctx.addIssue({ code: "custom", path: ["bicCode"], message: bic.errors[0] ?? "Некорректный номер" });
  if (value.tareWeightKg >= value.maxGrossWeightKg) {
    ctx.addIssue({ code: "custom", path: ["tareWeightKg"], message: "Тара должна быть меньше брутто" });
  }
  if (value.currentBookValueUsd > value.purchasePriceUsd) {
    ctx.addIssue({ code: "custom", path: ["currentBookValueUsd"], message: "Остаточная стоимость не может превышать цену покупки" });
  }
});

export type ContainerInput = z.input<typeof baseContainerSchema>;

/** Операционные статусы, которые управляются только через модули One-Way / аренды. */
const MANAGED_STATUSES = new Set(["ONE_WAY", "LONG_TERM_LEASE"]);

export async function createContainerAction(input: ContainerInput): Promise<ActionResult> {
  const auth = await authorize("fleet:edit");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(containerSchema, input);
  if (!parsed.ok) return parsed.result;
  const data = parsed.data;
  if (MANAGED_STATUSES.has(data.operationalStatus)) {
    return { ok: false, error: "Статусы One-Way и аренды назначаются через соответствующие модули", fieldErrors: { operationalStatus: "Недоступно при создании" } };
  }
  const bicCode = validateBic(data.bicCode).normalized;

  const exists = await prisma.container.findUnique({ where: { bicCode }, select: { id: true } });
  if (exists) return { ok: false, error: `Контейнер ${formatBic(bicCode)} уже есть в реестре`, fieldErrors: { bicCode: "Номер уже существует" } };

  try {
    const now = new Date();
    const container = await prisma.container.create({
      data: {
        ...data,
        bicCode,
        maxPayloadKg: data.maxGrossWeightKg - data.tareWeightKg,
        storageStartDate: data.operationalStatus === "AVAILABLE" ? startOfDayUtc(now) : null,
        events: {
          create: [
            {
              type: "PURCHASE",
              occurredAt: now,
              locode: data.currentLocode,
              terminal: data.currentTerminal,
              description: `Контейнер введён в реестр. Покупка ${data.purchaseDate.toISOString().slice(0, 10)} у ${data.manufacturer}.`,
              amountUsd: data.purchasePriceUsd,
              actor: session.name,
            },
          ],
        },
      },
    });
    revalidatePath("/", "layout");
    return { ok: true, message: `Контейнер ${formatBic(bicCode)} добавлен в парк`, id: container.id };
  } catch (error) {
    return serverError("containers", error);
  }
}

export async function updateContainerAction(id: string, input: ContainerInput): Promise<ActionResult> {
  const auth = await authorize("fleet:edit");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(containerSchema, input);
  if (!parsed.ok) return parsed.result;
  const data = parsed.data;
  const bicCode = validateBic(data.bicCode).normalized;

  const current = await prisma.container.findUnique({ where: { id } });
  if (!current) return notFound("Контейнер");

  const statusChangedToManaged = data.operationalStatus !== current.operationalStatus && MANAGED_STATUSES.has(data.operationalStatus);
  const leavingManaged = data.operationalStatus !== current.operationalStatus && MANAGED_STATUSES.has(current.operationalStatus);
  if (statusChangedToManaged || leavingManaged) {
    return {
      ok: false,
      error: "Выдача/возврат One-Way и аренды оформляются в соответствующих модулях",
      fieldErrors: { operationalStatus: "Используйте модуль One-Way или «Долгосрочная аренда»" },
    };
  }
  if (bicCode !== current.bicCode) {
    const clash = await prisma.container.findUnique({ where: { bicCode }, select: { id: true } });
    if (clash) return { ok: false, error: "Такой номер уже есть в реестре", fieldErrors: { bicCode: "Номер уже существует" } };
  }

  const changes: string[] = [];
  if (current.techStatus !== data.techStatus) changes.push(`тех. статус: ${TECH_STATUS_LABELS[current.techStatus as keyof typeof TECH_STATUS_LABELS] ?? current.techStatus} → ${TECH_STATUS_LABELS[data.techStatus]}`);
  if (current.operationalStatus !== data.operationalStatus) changes.push(`режим: ${OPERATIONAL_STATUS_LABELS[current.operationalStatus as keyof typeof OPERATIONAL_STATUS_LABELS] ?? current.operationalStatus} → ${OPERATIONAL_STATUS_LABELS[data.operationalStatus]}`);
  if (current.conditionGrade !== data.conditionGrade) changes.push(`грейд: ${current.conditionGrade} → ${data.conditionGrade}`);
  if (current.currentLocode !== data.currentLocode || current.currentTerminal !== data.currentTerminal) changes.push(`локация: ${data.currentLocode}, ${data.currentTerminal}`);

  const becameAvailable = data.operationalStatus === "AVAILABLE" && current.operationalStatus !== "AVAILABLE";
  try {
    await prisma.container.update({
      where: { id },
      data: {
        ...data,
        bicCode,
        maxPayloadKg: data.maxGrossWeightKg - data.tareWeightKg,
        storageStartDate: data.operationalStatus !== "AVAILABLE" ? null : becameAvailable ? startOfDayUtc(new Date()) : current.storageStartDate,
        events: changes.length
          ? {
              create: {
                type: "STATUS_CHANGE",
                occurredAt: new Date(),
                locode: data.currentLocode,
                terminal: data.currentTerminal,
                description: `Карточка обновлена: ${changes.join("; ")}.`,
                actor: session.name,
              },
            }
          : undefined,
      },
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Карточка контейнера сохранена" };
  } catch (error) {
    return serverError("containers", error);
  }
}

const writeOffSchema = z.object({ reason: requiredText("причина списания", 500) });

/** Статусы, из которых контейнер можно списать: он на территории компании и не в операции. */
const WRITE_OFF_FROM = ["AVAILABLE", "MAINTENANCE", "IN_TRANSIT"];

/**
 * Списание (1.3) — мягкое удаление: статус WRITTEN_OFF + deletedAt. Журнал, рейсы и договоры сохраняются,
 * в реестре единица видна только в фильтре «Списанные». Физическое удаление запрещено и на уровне БД (RESTRICT).
 */
export async function deleteContainerAction(id: string, input: z.input<typeof writeOffSchema>): Promise<ActionResult> {
  const auth = await authorize("fleet:delete");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(writeOffSchema, input);
  if (!parsed.ok) return parsed.result;
  const container = await prisma.container.findUnique({
    where: { id },
    select: { bicCode: true, operationalStatus: true, deletedAt: true, currentLocode: true, currentTerminal: true },
  });
  if (!container) return notFound("Контейнер");
  if (container.deletedAt) return { ok: false, error: `${formatBic(container.bicCode)} уже списан` };
  if (!WRITE_OFF_FROM.includes(container.operationalStatus)) {
    return { ok: false, error: "Нельзя списать контейнер в активном One-Way, аренде или резерве — сначала оформите возврат" };
  }
  const openTrip = await prisma.oneWayTrip.findFirst({ where: { containerId: id, status: { in: ["ACTIVE", "DISPUTE"] } }, select: { bookingRef: true } });
  if (openTrip) {
    return { ok: false, error: `По рейсу One-Way ${openTrip.bookingRef} есть незакрытая претензия — сначала урегулируйте её` };
  }
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const written = await tx.container.updateMany({
        where: { id, deletedAt: null, operationalStatus: { in: WRITE_OFF_FROM } },
        data: { operationalStatus: "WRITTEN_OFF", deletedAt: now, storageStartDate: null },
      });
      if (written.count === 0) throw new ConflictError(`${formatBic(container.bicCode)} уже списан или выдан — обновите страницу`);
      await tx.containerEvent.create({
        data: {
          containerId: id,
          type: "WRITE_OFF",
          occurredAt: now,
          locode: container.currentLocode,
          terminal: container.currentTerminal,
          description: `Списан из парка. Причина: ${parsed.data.reason}`,
          actor: session.name,
        },
      });
    });
  } catch (error) {
    return serverError("containers", error);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Контейнер ${formatBic(container.bicCode)} списан. История сохранена, единица доступна в фильтре «Списанные»` };
}

const eventSchema = z.object({
  type: z.enum(MANUAL_EVENT_TYPES, { error: "Этот тип события создаётся только операцией" }),
  occurredAt: dateField,
  description: requiredText("описание", 1000),
  amountUsd: z.union([moneyField, z.literal("").transform(() => null), z.null()]).optional().transform((v) => v ?? null),
});

export async function addContainerEventAction(containerId: string, input: z.input<typeof eventSchema>): Promise<ActionResult> {
  const auth = await authorize("fleet:edit");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(eventSchema, input);
  if (!parsed.ok) return parsed.result;
  const container = await prisma.container.findUnique({ where: { id: containerId }, select: { currentLocode: true, currentTerminal: true } });
  if (!container) return notFound("Контейнер");
  await prisma.containerEvent.create({
    data: {
      containerId,
      ...parsed.data,
      locode: container.currentLocode,
      terminal: container.currentTerminal,
      actor: session.name,
    },
  });
  revalidatePath(`/containers/${containerId}`);
  return { ok: true, message: "Событие добавлено в журнал" };
}
