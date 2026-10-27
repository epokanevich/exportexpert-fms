import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { prismaMock, tx, session } = vi.hoisted(() => {
  const tx = {
    oneWayTrip: { create: vi.fn(), updateMany: vi.fn() },
    container: { update: vi.fn(), updateMany: vi.fn() },
    containerEvent: { create: vi.fn(), createMany: vi.fn() },
    leaseItem: { updateMany: vi.fn() },
    leaseContract: { create: vi.fn(), update: vi.fn() },
    leaseRatePeriod: { upsert: vi.fn() },
  };
  const prismaMock = {
    user: { findUnique: vi.fn() },
    container: { findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    oneWayTrip: { findUnique: vi.fn(), findFirst: vi.fn() },
    leaseContract: { findUnique: vi.fn(), update: vi.fn() },
    containerEvent: { createMany: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) => (typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[]))),
  };
  const session = { userId: "u1", email: "user@exportexpert.ru", name: "Тест", role: "ADMIN" };
  return { prismaMock, tx, session };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/dal", () => ({ requireSession: vi.fn(async () => session) }));

import { deleteContainerAction, updateContainerAction } from "./containers";
import { createOneWayAction, registerOneWayReturnAction, resolveDisputeAction } from "./one-way";
import { extendLeaseAction, offHireAction } from "./leases";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function actAs(role: string) {
  prismaMock.user.findUnique.mockResolvedValue({ role, name: `Пользователь ${role}` });
}

const activeTrip = {
  id: "t1",
  containerId: "c1",
  status: "ACTIVE",
  bookingRef: "OW-1",
  counterpartyName: "ООО «Тест»",
  handoverDate: d("2026-09-01"),
  freeDays: 10,
  deadlineDate: d("2026-09-11"),
  actualReturnDate: null,
  detentionRatePerDayUsd: 20,
  dropoffLocode: "RUMOW",
  notes: null,
  container: { bicCode: "TKRU2048121", techStatus: "SOUND", conditionGrade: "CW", eorAmountUsd: null, currentLocode: "RUMOW", currentTerminal: "ТЛЦ" },
};

beforeEach(() => {
  vi.clearAllMocks();
  actAs("ADMIN");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("role checks on the server", () => {
  test("INSPECTOR cannot write off a container", async () => {
    actAs("INSPECTOR");
    const result = await deleteContainerAction("c1", { reason: "Списание" });
    expect(result.ok).toBe(false);
    expect(prismaMock.container.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.container.delete).not.toHaveBeenCalled();
  });

  test("MANAGER cannot write off a container either (ADMIN only)", async () => {
    actAs("MANAGER");
    const result = await deleteContainerAction("c1", { reason: "Списание" });
    expect(result.ok).toBe(false);
    expect(prismaMock.container.delete).not.toHaveBeenCalled();
  });

  test("INSPECTOR cannot issue a container into One-Way", async () => {
    actAs("INSPECTOR");
    const result = await createOneWayAction({
      containerId: "c1", counterpartyName: "X", bookingRef: "OW-2", dropoffLocode: "RUMOW", dropoffTerminal: "ТЛЦ",
      handoverDate: "2026-10-01", freeDays: 10, feeUsd: 0, detentionRatePerDayUsd: 15,
    });
    expect(result.ok).toBe(false);
    expect(prismaMock.container.findUnique).not.toHaveBeenCalled();
  });

  test("a user deleted from the database loses access even with a valid token", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const result = await deleteContainerAction("c1", { reason: "Списание" });
    expect(result.ok).toBe(false);
  });
});

describe("D-21: technical state changes only through the inspection flow", () => {
  const damaged = {
    id: "c1", bicCode: "FESU5168773", sizeType: "20DC", isoCode: "22G1", manufactureYear: 2016, colorRal: "RAL 3020", manufacturer: "DFIC",
    tareWeightKg: 2230, maxGrossWeightKg: 30480, conditionGrade: "DAMAGED", techStatus: "DAMAGED", cscPlateExpiry: d("2026-11-07"),
    eorAmountUsd: 1240, operationalStatus: "AVAILABLE", currentLocode: "RUMOW", currentTerminal: "ТЛЦ Ворсино", storageRatePerDayUsd: 1.8,
    purchaseDate: d("2016-05-01"), purchasePriceUsd: 2650, currentBookValueUsd: 900, notes: null, deletedAt: null, storageStartDate: d("2026-10-22"),
  };
  const form = (overrides: Record<string, unknown> = {}) => ({
    bicCode: "FESU 516877-3", sizeType: "20DC", isoCode: "22G1", manufactureYear: 2016, colorRal: "RAL 3020", manufacturer: "DFIC",
    tareWeightKg: 2230, maxGrossWeightKg: 30480, conditionGrade: "DAMAGED", techStatus: "DAMAGED", cscPlateExpiry: "2026-11-07",
    eorAmountUsd: 1240, operationalStatus: "AVAILABLE", currentLocode: "RUMOW", currentTerminal: "ТЛЦ Ворсино", storageRatePerDayUsd: 1.8,
    purchaseDate: "2016-05-01", purchasePriceUsd: 2650, currentBookValueUsd: 900, notes: "", ownershipType: "OWNED", ownerName: "ООО «Экспортэксперт»", ...overrides,
  }) as never;

  test("MANAGER cannot mark a damaged container SOUND via «Изменить»", async () => {
    actAs("MANAGER");
    prismaMock.container.findUnique.mockResolvedValue(damaged);
    const result = await updateContainerAction("c1", form({ techStatus: "SOUND", conditionGrade: "CW", eorAmountUsd: "" }));
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringMatching(/акт осмотра/) });
    expect(prismaMock.container.update).not.toHaveBeenCalled();
  });

  test("the CSC date cannot be moved by editing the card either (only «Продлить КБК»)", async () => {
    prismaMock.container.findUnique.mockResolvedValue(damaged);
    const result = await updateContainerAction("c1", form({ cscPlateExpiry: "2029-01-01" }));
    expect(result.ok).toBe(false);
    expect(prismaMock.container.update).not.toHaveBeenCalled();
  });

  test("passport and location edits without touching the technical state are still allowed", async () => {
    prismaMock.container.findUnique.mockResolvedValue(damaged);
    prismaMock.container.update.mockResolvedValue(damaged);
    const result = await updateContainerAction("c1", form({ colorRal: "RAL 5013", notes: "Перекрашен" }));
    expect(result).toMatchObject({ ok: true });
  });
});

describe("write-off is a soft delete (1.3)", () => {
  const onStock = { id: "c1", bicCode: "TKRU2048121", operationalStatus: "AVAILABLE", deletedAt: null, currentLocode: "RUVVO", currentTerminal: "ВМТП" };

  test("ADMIN write-off keeps the container and its history: status WRITTEN_OFF + deletedAt, no DELETE", async () => {
    prismaMock.container.findUnique.mockResolvedValue(onStock);
    prismaMock.oneWayTrip.findFirst.mockResolvedValue(null);
    tx.container.updateMany.mockResolvedValue({ count: 1 });

    const result = await deleteContainerAction("c1", { reason: "Коррозия рамы, восстановление нерентабельно" });

    expect(result).toMatchObject({ ok: true });
    expect(prismaMock.container.delete).not.toHaveBeenCalled();
    expect(tx.container.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "c1", deletedAt: null, operationalStatus: { in: ["AVAILABLE", "MAINTENANCE", "IN_TRANSIT"] } },
      data: expect.objectContaining({ operationalStatus: "WRITTEN_OFF", deletedAt: expect.any(Date) }),
    }));
    expect(tx.containerEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "WRITE_OFF" }) }));
  });

  test("a write-off requires a reason", async () => {
    const result = await deleteContainerAction("c1", { reason: "" });
    expect(result.ok).toBe(false);
    expect(tx.container.updateMany).not.toHaveBeenCalled();
  });

  test("an already written-off container cannot be written off twice", async () => {
    prismaMock.container.findUnique.mockResolvedValue({ ...onStock, operationalStatus: "WRITTEN_OFF", deletedAt: new Date() });
    const result = await deleteContainerAction("c1", { reason: "Повтор" });
    expect(result.ok).toBe(false);
    expect(tx.container.updateMany).not.toHaveBeenCalled();
  });
});

describe("check-then-act races are closed inside the transaction", () => {
  test("a second concurrent Gate-In does not book detention again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00.000Z"));
    prismaMock.oneWayTrip.findUnique.mockResolvedValue(activeTrip);
    tx.oneWayTrip.updateMany.mockResolvedValue({ count: 0 }); // другой запрос уже закрыл рейс

    const result = await registerOneWayReturnAction("t1", { returnDate: "2026-10-20", terminal: "ТЛЦ", condition: "SOUND" });

    expect(result.ok).toBe(false);
    expect(tx.oneWayTrip.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "t1", status: "ACTIVE" } }));
    expect(tx.container.update).not.toHaveBeenCalled();
  });

  test("a dispute cannot be settled twice", async () => {
    prismaMock.oneWayTrip.findUnique.mockResolvedValue({ ...activeTrip, status: "DISPUTE" });
    tx.oneWayTrip.updateMany.mockResolvedValue({ count: 0 });

    const result = await resolveDisputeAction("t1", { compensationUsd: 500 });

    expect(result.ok).toBe(false);
    expect(tx.container.update).not.toHaveBeenCalled();
  });

  test("One-Way issue claims the container only while it is still on stock", async () => {
    prismaMock.container.findUnique.mockResolvedValue({ id: "c1", bicCode: "TKRU2048121", operationalStatus: "AVAILABLE", techStatus: "SOUND", cscPlateExpiry: d("2030-01-01"), currentLocode: "RUVVO", currentTerminal: "ВМТП" });
    tx.container.updateMany.mockResolvedValue({ count: 0 }); // параллельно выдан в другой рейс

    const result = await createOneWayAction({
      containerId: "c1", counterpartyName: "X", bookingRef: "OW-2", dropoffLocode: "RUMOW", dropoffTerminal: "ТЛЦ",
      handoverDate: "2026-10-01", freeDays: 10, feeUsd: 100, detentionRatePerDayUsd: 15,
    });

    expect(result.ok).toBe(false);
    expect(tx.container.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1", operationalStatus: "AVAILABLE" } }));
    expect(tx.oneWayTrip.create).not.toHaveBeenCalled();
  });

  test("Off-Hire of an item already returned by a parallel request books no revenue", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00.000Z"));
    prismaMock.leaseContract.findUnique.mockResolvedValue({
      id: "l1", contractNumber: "LC-1", allowedReturnLocodes: "RULED", dailyRateUsd: 2.5, status: "ACTIVE", startDate: d("2026-05-09"), ratePeriods: [],
      items: [{ id: "i1", containerId: "c1", onHireDate: d("2026-05-09"), offHireDate: null, container: { techStatus: "SOUND", conditionGrade: "CW", eorAmountUsd: null } }],
    });
    tx.leaseItem.updateMany.mockResolvedValue({ count: 0 });

    const result = await offHireAction("l1", { itemIds: ["i1"], returnDate: "2026-10-26", returnLocode: "RULED", terminal: "ПКТ", condition: "SOUND" });

    expect(result.ok).toBe(false);
    expect(tx.leaseItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "i1", offHireDate: null } }));
    expect(tx.container.update).not.toHaveBeenCalled();
  });
});

describe("business dates", () => {
  test("Gate-In dated today in Vladivostok is accepted before 10:00 local time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T22:30:00.000Z")); // 08:30 27.10 во Владивостоке
    prismaMock.oneWayTrip.findUnique.mockResolvedValue(activeTrip);
    tx.oneWayTrip.updateMany.mockResolvedValue({ count: 1 });

    const result = await registerOneWayReturnAction("t1", { returnDate: "2026-10-27", terminal: "ТЛЦ", condition: "SOUND" });

    expect(result).toMatchObject({ ok: true });
  });

  test("a date two days ahead is still rejected", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T22:30:00.000Z"));
    prismaMock.oneWayTrip.findUnique.mockResolvedValue(activeTrip);

    const result = await registerOneWayReturnAction("t1", { returnDate: "2026-10-28", terminal: "ТЛЦ", condition: "SOUND" });

    expect(result.ok).toBe(false);
  });
});

describe("lease extension with a new Per Diem rate (D-08)", () => {
  const lease = {
    id: "l1", status: "ACTIVE", contractNumber: "LC-1", startDate: d("2026-01-01"), endDate: d("2026-11-05"), dailyRateUsd: 4,
    ratePeriods: [{ effectiveFrom: d("2026-01-01"), dailyRateUsd: 4 }], items: [],
  };

  test("a new rate starts a rate period from the given date; earlier days keep the old rate", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T09:00:00.000Z"));
    prismaMock.leaseContract.findUnique.mockResolvedValue(lease);

    const result = await extendLeaseAction("l1", { months: 6, newDailyRateUsd: 6, rateEffectiveFrom: "2026-07-02" });

    expect(result).toMatchObject({ ok: true });
    expect(tx.leaseRatePeriod.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { leaseId_effectiveFrom: { leaseId: "l1", effectiveFrom: d("2026-07-02") } },
      create: expect.objectContaining({ leaseId: "l1", dailyRateUsd: "6.00" }),
    }));
    expect(tx.leaseContract.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ dailyRateUsd: "6.00" }) }));
  });

  test("refuses a retroactive rate: days already accrued are never re-priced", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T09:00:00.000Z"));
    prismaMock.leaseContract.findUnique.mockResolvedValue(lease);

    const result = await extendLeaseAction("l1", { months: 6, newDailyRateUsd: 6, rateEffectiveFrom: "2026-06-01" });

    expect(result.ok).toBe(false);
    expect(tx.leaseRatePeriod.upsert).not.toHaveBeenCalled();
  });

  test("extension without a new rate keeps the rate history untouched", async () => {
    prismaMock.leaseContract.findUnique.mockResolvedValue(lease);

    const result = await extendLeaseAction("l1", { months: 3 });

    expect(result).toMatchObject({ ok: true });
    expect(tx.leaseRatePeriod.upsert).not.toHaveBeenCalled();
  });
});

describe("Off-Hire books rent by rate periods", () => {
  test("273 days: 182 × $4 + 91 × $6 = $1 274 goes to revenue, not 273 × $6", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00.000Z"));
    prismaMock.leaseContract.findUnique.mockResolvedValue({
      id: "l1", contractNumber: "LC-1", allowedReturnLocodes: "RULED", dailyRateUsd: 6, status: "ACTIVE", startDate: d("2026-01-01"),
      ratePeriods: [{ effectiveFrom: d("2026-01-01"), dailyRateUsd: 4 }, { effectiveFrom: d("2026-07-02"), dailyRateUsd: 6 }],
      items: [{ id: "i1", containerId: "c1", onHireDate: d("2026-01-01"), offHireDate: null, container: { techStatus: "SOUND", conditionGrade: "CW", eorAmountUsd: null } }],
    });
    tx.leaseItem.updateMany.mockResolvedValue({ count: 1 });

    const result = await offHireAction("l1", { itemIds: ["i1"], returnDate: "2026-10-01", returnLocode: "RULED", terminal: "ПКТ", condition: "SOUND" });

    expect(result).toMatchObject({ ok: true });
    expect(tx.container.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalRevenueUsd: { increment: "1274.00" } }),
    }));
  });
});
