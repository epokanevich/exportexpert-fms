/**
 * Генератор демо-данных. Используется и CLI-сидом (prisma/seed.ts), и кнопкой «Сбросить демо-данные».
 * Детерминирован (фиксированный seed PRNG), все даты — относительно `now`.
 */
import type { Prisma } from "@prisma/client";
import type { AppPrismaClient, AppTransaction } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { addDays, addMonths, startOfDayUtc } from "@/lib/dates";
import { DEFAULT_ISO_CODE, DEFAULT_WEIGHTS, locodeCity, terminalsOf } from "@/lib/domain/constants";
import { buildBic } from "@/lib/iso6346";
import { formatDate } from "@/lib/format";
import { rentalDaysInRange } from "@/lib/domain/lease";
import { computeDeadline } from "@/lib/domain/one-way";
import { mulRate, roundMoney } from "@/lib/money";
import {
  ACTIVE_TRIPS,
  CONTAINERS,
  COUNTERPARTIES,
  HISTORY_ROUTES,
  LEASES,
  MAKERS,
  type ContainerSpec,
} from "./fleet-spec";

export const DEMO_USERS = [
  { email: "admin@exportexpert.ru", name: "Администратор парка", role: "ADMIN", password: "Export2026!" },
  { email: "inspector@exportexpert.ru", name: "Инспектор терминала", role: "INSPECTOR", password: "Export2026!" },
] as const;

const ACTORS = {
  dispatcher: "Диспетчер Е. Иванова",
  manager: "Менеджер парка А. Соколов",
  edi: "EDI CODECO",
  system: "Система FMS",
} as const;

type Tx = AppTransaction;
type EventDraft = Omit<Prisma.ContainerEventCreateManyInput, "containerId">;
type Location = [locode: string, terminal: string];

/** Mulberry32 — детерминированный PRNG. */
function createRng(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
  };
}
type Rng = ReturnType<typeof createRng>;

const BASE_PRICE: Record<string, number> = {
  "20DC": 2650, "20HQ": 3100, "40DC": 3900, "40HC": 4350, "40HR": 14200, "20OT": 3700, "40FR": 6600,
};
const RAL_BY_PREFIX: Record<string, string> = {
  EXEX: "RAL 5013 (кобальтовый синий)",
  FESU: "RAL 3020 (транспортный красный)",
  TKRU: "RAL 7035 (светло-серый)",
  RZDU: "RAL 6005 (зелёный мох)",
};

function homeOf(spec: ContainerSpec): Location {
  const terminal = spec.terminal.startsWith("В пути") ? terminalsOf(spec.locode)[0] ?? spec.terminal : spec.terminal;
  return [spec.locode, terminal];
}

function factoryOf(spec: ContainerSpec): Location {
  if (spec.maker === MAKERS.abakan) return ["RUOVB", "ТК Клещиха"];
  if (spec.maker === MAKERS.singamas) return ["CNNGB", "Ningbo Beilun"];
  return ["CNSHA", "Shanghai SIPG"];
}

function bookValue(price: number, purchaseDate: Date, now: Date): number {
  const years = (now.getTime() - purchaseDate.getTime()) / (365.25 * 86_400_000);
  const residual = Math.max(0.1, 1 - (0.9 * years) / 15);
  return Math.round(price * residual);
}

interface BuildContext {
  rng: Rng;
  today: Date;
  at: (dayOffset: number, hour?: number) => Date;
}

interface HistoryResult {
  events: EventDraft[];
  trips: Omit<Prisma.OneWayTripCreateManyInput, "containerId">[];
  revenueUsd: number;
  repairCostUsd: number;
}

/** Прошлые циклы: One-Way и собственные рейсы, ремонты, освидетельствования. */
function buildHistory(spec: ContainerSpec, purchaseDate: Date, firstActivity: Date, lastReturn: Date | null, ctx: BuildContext): HistoryResult {
  const { rng } = ctx;
  const result: HistoryResult = { events: [], trips: [], revenueUsd: 0, repairCostUsd: 0 };
  let position: Location = factoryOf(spec);

  result.events.push({
    type: "PURCHASE",
    occurredAt: purchaseDate,
    locode: position[0],
    terminal: position[1],
    description: `Приобретен у ${spec.maker} (${spec.year} г.), ввод в парк «Экспортэксперт». Табличка КБК (CSC) установлена.`,
    actor: ACTORS.manager,
  });
  result.events.push({
    type: "GATE_IN",
    occurredAt: addDays(purchaseDate, 2),
    locode: position[0],
    terminal: position[1],
    description: "Gate-In на депо после приёмки с завода. Состояние: IICL-6 (новый).",
    actor: ACTORS.edi,
  });

  const windowEnd = lastReturn ?? addDays(firstActivity, -10);
  // История сосредоточена в последних ~2 годах перед текущим состоянием — так таймлайн плотнее.
  const recentStart = addDays(windowEnd, -(spec.pastCycles * 75 + 30));
  const earliest = addDays(purchaseDate, 20);
  const windowStart = recentStart > earliest ? recentStart : earliest;
  const windowDays = Math.floor((windowEnd.getTime() - windowStart.getTime()) / 86_400_000);
  const cycles = Math.min(spec.pastCycles, Math.floor(windowDays / 40));
  const home = homeOf(spec);

  for (let i = 0; i < cycles; i++) {
    const isLast = i === cycles - 1;
    const segment = Math.floor(windowDays / cycles);
    const dropoff: Location = isLast ? home : (() => {
      const route = rng.pick(HISTORY_ROUTES);
      return route[1][0] === position[0] ? route[0] : route[1];
    })();
    const isDispute = isLast && spec.key === "D1";
    const isOneWay = isDispute || rng.next() < 0.6;
    const freeDays = rng.pick([21, 30, 30, 45]);
    const overdue = isDispute ? 0 : rng.next() < 0.3 ? rng.int(2, 9) : 0;
    const tripDays = isOneWay ? Math.min(segment - 5, freeDays - rng.int(0, 6) + overdue) : Math.min(segment - 5, rng.int(18, 32));

    const returnDate = isLast && lastReturn ? lastReturn : addDays(windowStart, segment * (i + 1) - rng.int(2, 6));
    const handover = addDays(returnDate, -Math.max(10, tripDays));

    if (isOneWay) {
      const cp = isDispute ? COUNTERPARTIES[4] : rng.pick(COUNTERPARTIES);
      const booking = isDispute ? "OW-2026-0871" : `OW-${handover.getUTCFullYear()}-${String(rng.int(100, 899)).padStart(4, "0")}`;
      const fee = isDispute ? 0 : rng.pick([0, 0, 50, 100, 150]);
      const rate = rng.pick([10, 12, 15, 20]);
      const deadline = addDays(handover, isDispute ? 30 : freeDays);
      const realOverdue = Math.max(0, Math.round((returnDate.getTime() - deadline.getTime()) / 86_400_000));
      const detention = realOverdue * rate;
      result.trips.push({
        counterpartyName: cp.name,
        counterpartyInn: cp.inn,
        bookingRef: booking,
        pickupLocode: position[0],
        pickupTerminal: position[1],
        dropoffLocode: dropoff[0],
        dropoffTerminal: dropoff[1],
        handoverDate: handover,
        freeDays: isDispute ? 30 : freeDays,
        deadlineDate: deadline,
        actualReturnDate: returnDate,
        feeUsd: fee,
        detentionRatePerDayUsd: rate,
        status: isDispute ? "DISPUTE" : "COMPLETED",
        returnCondition: isDispute ? "DAMAGED" : "SOUND",
        returnEorUsd: isDispute ? spec.eor ?? null : null,
        notes: isDispute ? "Повреждение при сдаче: пробоина боковой стенки. Выставлена претензия на сумму EOR." : null,
      });
      result.events.push({
        type: "ONE_WAY_OUT",
        occurredAt: new Date(handover.getTime() + 10 * 3_600_000),
        locode: position[0],
        terminal: position[1],
        description: `Gate-Out: выдан в One-Way ${booking} контрагенту ${cp.name}. Маршрут ${locodeCity(position[0])} → ${locodeCity(dropoff[0])}, ${isDispute ? 30 : freeDays} свободных дней.`,
        amountUsd: fee > 0 ? fee : null,
        actor: ACTORS.dispatcher,
      });
      result.events.push({
        type: "ONE_WAY_IN",
        occurredAt: new Date(returnDate.getTime() + 14 * 3_600_000),
        locode: dropoff[0],
        terminal: dropoff[1],
        description: isDispute
          ? `Gate-In по One-Way ${booking}. При приёмке выявлено повреждение — открыт спор (DISPUTE), EOR $${spec.eor}.${detention > 0 ? ` Просрочка ${realOverdue} дн., детеншн $${detention}.` : ""}`
          : `Gate-In по One-Way ${booking}. Состояние при приёмке: исправен.${detention > 0 ? ` Просрочка ${realOverdue} дн., детеншн $${detention}.` : ""}`,
        amountUsd: detention > 0 ? detention : null,
        actor: ACTORS.edi,
      });
      result.revenueUsd += fee + detention;
    } else {
      const freight = rng.int(9, 22) * 100;
      result.events.push({
        type: "GATE_OUT",
        occurredAt: new Date(handover.getTime() + 9 * 3_600_000),
        locode: position[0],
        terminal: position[1],
        description: `Gate-Out: собственный гружёный рейс ${locodeCity(position[0])} → ${locodeCity(dropoff[0])}.`,
        actor: ACTORS.dispatcher,
      });
      result.events.push({
        type: "GATE_IN",
        occurredAt: new Date(returnDate.getTime() + 16 * 3_600_000),
        locode: dropoff[0],
        terminal: dropoff[1],
        description: `Gate-In после выгрузки. Маржа рейса, отнесённая на единицу: $${freight}.`,
        amountUsd: freight,
        actor: ACTORS.edi,
      });
      result.revenueUsd += freight;
    }

    // Периодический осмотр и мелкий ремонт после рейса (не для последнего цикла перед текущим состоянием).
    if (!isLast && rng.next() < 0.35) {
      const cost = rng.int(12, 48) * 10;
      const repairDay = addDays(returnDate, 2);
      result.events.push({
        type: "REPAIR_START",
        occurredAt: new Date(repairDay.getTime() + 11 * 3_600_000),
        locode: dropoff[0],
        terminal: dropoff[1],
        description: `Передан в ремонт по EOR $${cost}: ${rng.pick(["правка гофры боковой стенки", "замена уплотнителей дверей", "ремонт напольного покрытия", "правка нижней поперечины"])}.`,
        amountUsd: cost,
        actor: ACTORS.manager,
      });
      result.events.push({
        type: "REPAIR_DONE",
        occurredAt: new Date(addDays(repairDay, 3).getTime() + 15 * 3_600_000),
        locode: dropoff[0],
        terminal: dropoff[1],
        description: `Ремонт завершён, фактическая стоимость $${cost}. Грейд восстановлен до Cargo Worthy.`,
        amountUsd: cost,
        actor: ACTORS.manager,
      });
      result.repairCostUsd += cost;
    }
    position = dropoff;
  }
  return result;
}

interface ContainerBuild {
  data: Omit<Prisma.ContainerCreateManyInput, "id">;
  events: EventDraft[];
  trips: Omit<Prisma.OneWayTripCreateManyInput, "containerId">[];
}

function buildContainer(spec: ContainerSpec, ctx: BuildContext): ContainerBuild {
  const { rng, today, at } = ctx;
  const stateStart = addDays(today, -spec.sinceDays);
  const lease = LEASES.find((l) => l.containerKeys.includes(spec.key));
  const firstActivity = lease ? addDays(today, -lease.startDaysAgo) : stateStart;

  let purchaseDate = new Date(Date.UTC(spec.year, rng.int(0, 10), rng.int(1, 28)));
  if (purchaseDate.getTime() > addDays(firstActivity, -45).getTime()) purchaseDate = addDays(firstActivity, -45);

  // Для контейнеров, прибывших на текущий сток/ремонт после рейса, последний цикл заканчивается Gate-In'ом сюда.
  const arrivesFromTrip = (spec.op === "AVAILABLE" || spec.op === "MAINTENANCE") && !lease && spec.pastCycles > 0;
  const lastReturn = arrivesFromTrip ? addDays(stateStart, spec.op === "MAINTENANCE" ? -2 : 0) : null;
  const history = buildHistory(spec, purchaseDate, firstActivity, lastReturn, ctx);
  const events = [...history.events];
  const [locode, terminal] = homeOf(spec);
  const cscExpiry = addDays(today, spec.cscDays);
  let revenue = history.revenueUsd;

  const lastAcep = addMonths(cscExpiry, -30);
  if (lastAcep > addDays(purchaseDate, 365) && lastAcep < today) {
    events.push({
      type: "CSC_RENEWAL",
      occurredAt: new Date(lastAcep.getTime() + 12 * 3_600_000),
      locode,
      terminal,
      description: `Освидетельствование по программе ACEP пройдено. Табличка КБК (CSC) действительна до ${formatDate(cscExpiry)}.`,
      actor: ACTORS.manager,
    });
  }

  // Текущее состояние
  switch (spec.op) {
    case "ONE_WAY": {
      const trip = ACTIVE_TRIPS.find((t) => t.containerKey === spec.key);
      if (trip) {
        events.push(
          { type: "INSPECTION", occurredAt: at(-spec.sinceDays - 1, 15), locode, terminal, description: "Предрейсовый осмотр (EIR): Cargo Worthy, пломбировочные устройства исправны.", actor: `Инспектор ${terminal}` },
          { type: "ONE_WAY_OUT", occurredAt: at(-spec.sinceDays, 10), locode, terminal, description: `Gate-Out: выдан в One-Way ${trip.bookingRef} контрагенту ${trip.counterparty}. Возврат: ${locodeCity(trip.dropoff[0])}, ${trip.dropoff[1]}; ${trip.freeDays} свободных дней.`, amountUsd: trip.feeUsd || null, actor: ACTORS.dispatcher },
        );
        revenue += trip.feeUsd;
      }
      break;
    }
    case "LONG_TERM_LEASE":
    case "AVAILABLE":
    case "MAINTENANCE":
    case "IN_TRANSIT":
      break;
  }

  if (lease) {
    const onHire = addDays(today, -lease.startDaysAgo);
    const offHire = lease.offHireDaysAgo !== undefined ? addDays(today, -lease.offHireDaysAgo) : null;
    events.push(
      { type: "INSPECTION", occurredAt: new Date(addDays(onHire, -1).getTime() + 14 * 3_600_000), locode, terminal, description: `On-Hire Survey по договору ${lease.contractNumber}: Cargo Worthy, акт подписан сторонами.`, actor: `Инспектор ${terminal}` },
      { type: "LEASE_ON_HIRE", occurredAt: new Date(onHire.getTime() + 11 * 3_600_000), locode, terminal, description: `On-Hire: передан в долгосрочную аренду ${lease.lessee} по договору ${lease.contractNumber}, Per Diem $${lease.dailyRate.toFixed(2)}.`, actor: ACTORS.manager },
    );
    if (offHire) {
      // Как в offHireAction: аренда попадает в выручку при Off-Hire. Для единиц на руках её начислит будущий Off-Hire.
      revenue += mulRate(lease.dailyRate, rentalDaysInRange({ onHireDate: onHire, offHireDate: offHire }, onHire, offHire));
      events.push(
        { type: "LEASE_OFF_HIRE", occurredAt: new Date(offHire.getTime() + 13 * 3_600_000), locode, terminal, description: `Off-Hire: возвращен из аренды по договору ${lease.contractNumber}. Off-Hire Survey подписан, повреждений нет.`, actor: ACTORS.manager },
        { type: "GATE_IN", occurredAt: new Date(offHire.getTime() + 15 * 3_600_000), locode, terminal, description: "Gate-In на сток после возврата из аренды. Ожидает выдачи.", actor: ACTORS.edi },
      );
    }
  }

  if (spec.op === "AVAILABLE" && !lease && spec.pastCycles === 0) {
    events.push({ type: "GATE_IN", occurredAt: at(-spec.sinceDays, 12), locode, terminal, description: "Gate-In на сток (доставлен с завода собственным рейсом).", actor: ACTORS.edi });
  }
  if (spec.key === "D1") {
    events.push({ type: "INSPECTION", occurredAt: at(-spec.sinceDays + 1, 11), locode, terminal, description: `Акт осмотра: ${spec.notes} EOR согласуется: $${spec.eor}.`, amountUsd: spec.eor, actor: `Инспектор ${terminal}` });
  }
  if (spec.key === "D2") {
    events.push(
      { type: "INSPECTION", occurredAt: at(-spec.sinceDays - 1, 10), locode, terminal, description: `Акт осмотра: повреждение пола и дверного проёма. Оценка ремонта (EOR) $${spec.eor}.`, amountUsd: spec.eor, actor: `Инспектор ${terminal}` },
      { type: "REPAIR_START", occurredAt: at(-spec.sinceDays, 9), locode, terminal, description: `Передан в ремонтную зону депо. EOR $${spec.eor} согласован, срок ремонта — 14 дней.`, amountUsd: spec.eor, actor: ACTORS.manager },
    );
  }
  if (spec.key === "H1") {
    events.push({ type: "STATUS_CHANGE", occurredAt: at(-spec.sinceDays + 1, 16), locode, terminal, description: "Тех. статус → HOLD. Блокировка ФТС: досмотр по последней поставке. Выдача запрещена.", actor: ACTORS.manager });
  }
  if (spec.op === "IN_TRANSIT") {
    events.push({ type: "GATE_OUT", occurredAt: at(-spec.sinceDays, 8), locode, terminal: homeOf(spec)[1], description: `Gate-Out: собственный гружёный рейс. ${spec.terminal.replace("В пути: ", "")}.`, actor: ACTORS.dispatcher });
  }

  const weights = DEFAULT_WEIGHTS[spec.size];
  const tare = weights.tare + rng.int(-4, 6) * 10;
  const price = BASE_PRICE[spec.size] + rng.int(-6, 9) * 50;
  const onStock = spec.op === "AVAILABLE";
  const terminalLabel =
    spec.op === "ONE_WAY" ? `Выдан: ${ACTIVE_TRIPS.find((t) => t.containerKey === spec.key)?.counterparty ?? "контрагент"}`
    : spec.op === "LONG_TERM_LEASE" ? `В аренде: ${lease?.lessee ?? "арендатор"}`
    : spec.terminal;

  return {
    data: {
      bicCode: buildBic(spec.prefix, spec.serial),
      sizeType: spec.size,
      isoCode: DEFAULT_ISO_CODE[spec.size],
      manufactureYear: spec.year,
      colorRal: RAL_BY_PREFIX[spec.prefix] ?? "RAL 5013",
      manufacturer: spec.maker,
      tareWeightKg: tare,
      maxGrossWeightKg: weights.gross,
      maxPayloadKg: weights.gross - tare,
      conditionGrade: spec.grade,
      techStatus: spec.tech,
      cscPlateExpiry: cscExpiry,
      eorAmountUsd: spec.eor ?? null,
      operationalStatus: spec.op,
      currentLocode: spec.locode,
      currentTerminal: terminalLabel,
      storageStartDate: onStock ? stateStart : null,
      storageRatePerDayUsd: onStock ? spec.storageRate ?? null : null,
      purchaseDate,
      purchasePriceUsd: price,
      currentBookValueUsd: bookValue(price, purchaseDate, today),
      totalRevenueUsd: roundMoney(revenue),
      totalRepairCostUsd: history.repairCostUsd,
      notes: spec.notes ?? null,
    },
    events,
    trips: history.trips,
  };
}

export interface SeedSummary {
  containers: number;
  events: number;
  oneWayTrips: number;
  leases: number;
}

async function clearDomainData(tx: Tx): Promise<void> {
  await tx.containerEvent.deleteMany();
  await tx.leaseItem.deleteMany();
  await tx.leaseRatePeriod.deleteMany();
  await tx.oneWayTrip.deleteMany();
  await tx.leaseContract.deleteMany();
  await tx.container.deleteMany();
}

export async function seedDatabase(prisma: AppPrismaClient, now: Date = new Date()): Promise<SeedSummary> {
  const today = startOfDayUtc(now);
  const ctx: BuildContext = {
    rng: createRng(6346),
    today,
    at: (dayOffset, hour = 12) => new Date(addDays(today, dayOffset).getTime() + hour * 3_600_000),
  };
  const builds = CONTAINERS.map((spec) => ({ spec, build: buildContainer(spec, ctx) }));

  // Все строки собираются в памяти с заранее выданными id и пишутся пакетно (createMany):
  // ~12 запросов вместо ~120 — критично для облачной БД и serverless-функции «Сбросить демо-данные».
  const idByKey = new Map<string, string>(builds.map(({ spec }) => [spec.key, randomUUID()]));
  const idOf = (key: string, context: string): string => {
    const id = idByKey.get(key);
    if (!id) throw new Error(`Не найден контейнер ${key} (${context})`);
    return id;
  };

  const containers = builds.map(({ spec, build }) => ({ id: idOf(spec.key, "контейнер"), ...build.data }));
  const events = builds.flatMap(({ spec, build }) =>
    build.events
      .filter((e) => new Date(e.occurredAt).getTime() <= now.getTime())
      .map((e) => ({ ...e, containerId: idOf(spec.key, "событие") })),
  );
  const historyTrips = builds.flatMap(({ spec, build }) => build.trips.map((t) => ({ ...t, containerId: idOf(spec.key, "история One-Way") })));
  const activeTrips: Prisma.OneWayTripCreateManyInput[] = ACTIVE_TRIPS.map((trip) => {
    const spec = CONTAINERS.find((c) => c.key === trip.containerKey);
    if (!spec) throw new Error(`Не найден контейнер ${trip.containerKey} для One-Way`);
    const handover = addDays(today, -spec.sinceDays);
    return {
      containerId: idOf(trip.containerKey, "One-Way"),
      counterpartyName: trip.counterparty,
      counterpartyInn: trip.inn,
      counterpartyContact: trip.contact,
      bookingRef: trip.bookingRef,
      pickupLocode: spec.locode,
      pickupTerminal: spec.terminal,
      dropoffLocode: trip.dropoff[0],
      dropoffTerminal: trip.dropoff[1],
      handoverDate: handover,
      freeDays: trip.freeDays,
      deadlineDate: computeDeadline(handover, trip.freeDays),
      feeUsd: trip.feeUsd,
      detentionRatePerDayUsd: trip.detentionRate,
      status: "ACTIVE",
    };
  });

  const leaseContracts: Prisma.LeaseContractCreateManyInput[] = [];
  const leaseItems: Prisma.LeaseItemCreateManyInput[] = [];
  const ratePeriods: Prisma.LeaseRatePeriodCreateManyInput[] = [];
  for (const lease of LEASES) {
    const leaseId = randomUUID();
    const startDate = addDays(today, -lease.startDaysAgo);
    const offHire = lease.offHireDaysAgo !== undefined ? addDays(today, -lease.offHireDaysAgo) : null;
    leaseContracts.push({
      id: leaseId,
      contractNumber: lease.contractNumber,
      lesseeName: lease.lessee,
      lesseeInn: lease.inn,
      contactPerson: lease.contactPerson,
      contactPhone: lease.phone,
      contactEmail: lease.email,
      startDate,
      endDate: addDays(today, lease.endInDays),
      autoRenewal: lease.autoRenewal,
      dailyRateUsd: lease.dailyRate,
      depositUsd: lease.deposit,
      paymentStatus: lease.paymentStatus,
      allowedReturnLocodes: lease.allowedReturn.join(","),
      onHireSurvey: "SIGNED",
      offHireSurvey: lease.status === "COMPLETED" ? "SIGNED" : lease.endInDays <= 14 ? "PENDING" : "NOT_STARTED",
      status: lease.status,
      notes: lease.notes ?? null,
    });
    ratePeriods.push({ leaseId, effectiveFrom: startDate, dailyRateUsd: lease.dailyRate });
    for (const key of lease.containerKeys) {
      leaseItems.push({
        leaseId,
        containerId: idOf(key, `договор ${lease.contractNumber}`),
        onHireDate: startDate,
        offHireDate: offHire,
        returnLocode: offHire ? lease.allowedReturn[0] : null,
      });
    }
  }

  // Хэши паролей считаем до транзакции, чтобы не держать её открытой во время bcrypt.
  const users = await Promise.all(DEMO_USERS.map(async (u) => ({ ...u, passwordHash: await bcrypt.hash(u.password, 10) })));

  return prisma.$transaction(
    async (tx) => {
      await clearDomainData(tx);
      for (const user of users) {
        await tx.user.upsert({
          where: { email: user.email },
          update: { name: user.name, role: user.role, passwordHash: user.passwordHash },
          create: { email: user.email, name: user.name, role: user.role, passwordHash: user.passwordHash },
        });
      }
      await tx.container.createMany({ data: containers });
      await tx.containerEvent.createMany({ data: events });
      await tx.oneWayTrip.createMany({ data: [...historyTrips, ...activeTrips] });
      await tx.leaseContract.createMany({ data: leaseContracts });
      await tx.leaseItem.createMany({ data: leaseItems });
      await tx.leaseRatePeriod.createMany({ data: ratePeriods });

      return { containers: containers.length, events: events.length, oneWayTrips: historyTrips.length + activeTrips.length, leases: leaseContracts.length };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}
