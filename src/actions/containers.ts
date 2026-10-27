"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod-setup";
import type { SessionPayload } from "@/lib/auth/session";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { validateBic, formatBic } from "@/lib/iso6346";
import { startOfDayUtc } from "@/lib/dates";
import { roundMoney, toDbMoney } from "@/lib/money";
import { audit } from "@/lib/audit";
import {
  CONDITION_GRADES,
  MANUAL_EVENT_TYPES,
  EVENT_TYPE_LABELS,
  OWNERSHIP_TYPES,
  MANAGED_OPERATIONAL_STATUSES,
  OPERATIONAL_STATUSES,
  SIZE_TYPES,
  TECH_STATUSES,
  OPERATIONAL_STATUS_LABELS,
  TECH_STATUS_LABELS,
} from "@/lib/domain/constants";
import { actorOf, authorize, ConflictError, dateField, locodeField, moneyField, optionalMoneyField, notFound, optionalText, parseInput, requiredText, serverError } from "./helpers";
import type { ActionResult } from "./types";
import { businessToday } from "@/lib/business-time";
import { IMPORT_FIELD_LABELS, MAX_IMPORT_BYTES, mapImportTable, parseCsv, type ImportIssue } from "@/lib/csv-import";

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
  cscPlateNumber: optionalText(60),
  acepNumber: optionalText(60),
  ownershipType: z.enum(OWNERSHIP_TYPES, { error: "Выберите тип владения" }),
  ownerName: requiredText("собственник", 200),
  lessorName: optionalText(200),
  eorAmountUsd: optionalMoneyField,
  operationalStatus: z.enum(OPERATIONAL_STATUSES),
  currentLocode: locodeField,
  currentTerminal: requiredText("терминал / депо", 120),
  storageRatePerDayUsd: optionalMoneyField,
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
  if (value.ownershipType !== "OWNED" && !value.lessorName) {
    ctx.addIssue({ code: "custom", path: ["lessorName"], message: "Укажите лизингодателя / собственника" });
  }
  if (value.currentBookValueUsd > value.purchasePriceUsd) {
    ctx.addIssue({ code: "custom", path: ["currentBookValueUsd"], message: "Остаточная стоимость не может превышать цену покупки" });
  }
});

export type ContainerInput = z.input<typeof baseContainerSchema>;

/** Операционные статусы, которые назначаются только операциями (One-Way, аренда, резерв, списание). */
const MANAGED_STATUSES = new Set<string>(MANAGED_OPERATIONAL_STATUSES);

type Tx = AppTransaction;

/** Запись контейнера + событие покупки + аудит в одной транзакции (общая для формы и импорта). */
async function insertContainer(tx: Tx, data: z.output<typeof containerSchema>, bicCode: string, session: SessionPayload, now: Date) {
  const created = await tx.container.create({
    data: {
      ...data,
      bicCode,
      maxPayloadKg: data.maxGrossWeightKg - data.tareWeightKg,
      storageStartDate: data.operationalStatus === "AVAILABLE" ? businessToday(now) : null,
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
  await audit(tx, { actor: actorOf(session), action: "CONTAINER_CREATE", entityType: "Container", entityId: created.id, summary: `${formatBic(bicCode)} добавлен в парк` });
  return created;
}

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
    const container = await prisma.$transaction((tx) => insertContainer(tx, data, bicCode, session, new Date()));
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
  if (current.deletedAt) return { ok: false, error: "Контейнер списан — карточка доступна только для просмотра" };

  // D-21: техсостояние и КБК меняются только актом осмотра / продлением КБК (с записью в журнал), не правкой карточки.
  const inspectionOnly: Record<string, string> = {};
  if (data.techStatus !== current.techStatus) inspectionOnly.techStatus = "Меняется актом осмотра";
  if (data.conditionGrade !== current.conditionGrade) inspectionOnly.conditionGrade = "Меняется актом осмотра";
  if ((data.eorAmountUsd === null ? null : roundMoney(data.eorAmountUsd)) !== current.eorAmountUsd) inspectionOnly.eorAmountUsd = "Меняется актом осмотра";
  if (startOfDayUtc(data.cscPlateExpiry).getTime() !== startOfDayUtc(current.cscPlateExpiry).getTime()) inspectionOnly.cscPlateExpiry = "Меняется кнопкой «Продлить КБК»";
  if (Object.keys(inspectionOnly).length > 0) {
    return {
      ok: false,
      error: "Тех. статус, грейд, EOR и срок КБК меняются только через акт осмотра или продление КБК — так изменение попадает в журнал",
      fieldErrors: inspectionOnly,
    };
  }

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
    await prisma.$transaction(async (tx) => {
      await tx.container.update({
      where: { id },
      data: {
        ...data,
        bicCode,
        maxPayloadKg: data.maxGrossWeightKg - data.tareWeightKg,
        storageStartDate: data.operationalStatus !== "AVAILABLE" ? null : becameAvailable ? businessToday() : current.storageStartDate,
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
      await audit(tx, { actor: actorOf(session), action: "CONTAINER_UPDATE", entityType: "Container", entityId: id, summary: `${formatBic(bicCode)}: карточка обновлена${changes.length ? ` (${changes.join("; ")})` : ""}` });
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
      await audit(tx, { actor: actorOf(session), action: "CONTAINER_WRITE_OFF", entityType: "Container", entityId: id, summary: `${formatBic(container.bicCode)} списан: ${parsed.data.reason}` });
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
  amountUsd: optionalMoneyField,
});

export async function addContainerEventAction(containerId: string, input: z.input<typeof eventSchema>): Promise<ActionResult> {
  const auth = await authorize("fleet:edit");
  if (!auth.ok) return auth.result;
  const { session } = auth;
  const parsed = parseInput(eventSchema, input);
  if (!parsed.ok) return parsed.result;
  const container = await prisma.container.findUnique({ where: { id: containerId }, select: { currentLocode: true, currentTerminal: true, deletedAt: true } });
  if (!container) return notFound("Контейнер");
  if (container.deletedAt) return { ok: false, error: "Контейнер списан — журнал только для просмотра" };
  try {
    await prisma.$transaction(async (tx) => {
      const event = await tx.containerEvent.create({
        data: {
          containerId,
          ...parsed.data,
          amountUsd: parsed.data.amountUsd === null ? null : toDbMoney(parsed.data.amountUsd),
          locode: container.currentLocode,
          terminal: container.currentTerminal,
          actor: session.name,
        },
      });
      await audit(tx, { actor: actorOf(session), action: "CONTAINER_EVENT_ADD", entityType: "ContainerEvent", entityId: event.id, summary: `${EVENT_TYPE_LABELS[parsed.data.type]}: ${parsed.data.description.slice(0, 200)}` });
    });
  } catch (error) {
    return serverError("containers", error);
  }
  revalidatePath(`/containers/${containerId}`);
  return { ok: true, message: "Событие добавлено в журнал" };
}

export interface ImportResult {
  ok: boolean;
  message: string;
  /** Сколько строк разобрано / будет добавлено. */
  total: number;
  imported: number;
  errors: ImportIssue[];
}

const fail = (message: string, errors: ImportIssue[] = [], total = 0): ImportResult => ({ ok: false, message, total, imported: 0, errors });

/**
 * Импорт парка из CSV. «Всё или ничего»: пока в файле есть хоть одна ошибка, в БД не пишется ничего.
 * commit=false — только проверка (предпросмотр), commit=true — запись одной транзакцией.
 * Каждая строка проходит ту же схему, что и форма «Добавить»; ограничения на статусы — те же.
 */
export async function importContainersAction(csvText: string, commit: boolean): Promise<ImportResult> {
  const auth = await authorize("fleet:edit");
  if (!auth.ok) return fail(auth.result.ok ? "" : auth.result.error);
  if (typeof csvText !== "string" || csvText.length === 0) return fail("Файл пуст");
  if (csvText.length > MAX_IMPORT_BYTES) return fail("Файл слишком большой — не более 1 МБ");

  const mapped = mapImportTable(parseCsv(csvText));
  const errors: ImportIssue[] = [...mapped.errors];
  const valid: { line: number; data: z.output<typeof containerSchema>; bicCode: string }[] = [];
  const seen = new Map<string, number>();
  const brokenLines = new Set(mapped.errors.map((e) => e.line));
  for (const row of mapped.rows) {
    if (brokenLines.has(row.line)) continue; // ячейка уже не разобрана — повторные ошибки схемы только шумят
    const parsed = containerSchema.safeParse(row.input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 3)) errors.push({ line: row.line, message: `${IMPORT_FIELD_LABELS[String(issue.path[0])] ?? "Строка"}: ${issue.message}` });
      continue;
    }
    if (MANAGED_STATUSES.has(parsed.data.operationalStatus)) {
      errors.push({ line: row.line, message: "Статус: One-Way и аренда назначаются операциями, а не импортом" });
      continue;
    }
    const bicCode = validateBic(parsed.data.bicCode).normalized;
    const firstLine = seen.get(bicCode);
    if (firstLine !== undefined) {
      errors.push({ line: row.line, message: `Номер ${formatBic(bicCode)} повторяется (первая строка — ${firstLine})` });
      continue;
    }
    seen.set(bicCode, row.line);
    valid.push({ line: row.line, data: parsed.data, bicCode });
  }

  if (valid.length > 0) {
    const existing = await prisma.container.findMany({ where: { bicCode: { in: valid.map((v) => v.bicCode) } }, select: { bicCode: true } });
    const existingSet = new Set(existing.map((e) => e.bicCode));
    for (const row of valid) if (existingSet.has(row.bicCode)) errors.push({ line: row.line, message: `Контейнер ${formatBic(row.bicCode)} уже есть в реестре` });
  }
  errors.sort((a, b) => a.line - b.line);
  const total = mapped.rows.length;
  if (errors.length > 0) return fail(`Найдено ошибок: ${errors.length}. Исправьте файл — ничего не загружено`, errors, total);
  if (!commit) return { ok: true, message: `Проверка пройдена: можно добавить ${valid.length} контейнеров`, total, imported: 0, errors: [] };

  try {
    const now = new Date();
    await prisma.$transaction(
      async (tx) => {
        for (const row of valid) await insertContainer(tx, row.data, row.bicCode, auth.session, now);
        await audit(tx, { actor: actorOf(auth.session), action: "CONTAINER_IMPORT", entityType: "System", summary: `Импорт парка из CSV: добавлено ${valid.length}` });
      },
      { timeout: 30_000 },
    );
    revalidatePath("/", "layout");
    return { ok: true, message: `Добавлено контейнеров: ${valid.length}`, total, imported: valid.length, errors: [] };
  } catch (error) {
    const result = serverError("containers-import", error);
    return fail(result.ok ? "" : result.error, [], total);
  }
}
