import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { prismaMock, tx, session } = vi.hoisted(() => {
  const tx = {
    oneWayTrip: { create: vi.fn(), updateMany: vi.fn() },
    container: { update: vi.fn(), updateMany: vi.fn() },
    containerEvent: { create: vi.fn(), createMany: vi.fn() },
    leaseItem: { updateMany: vi.fn() },
    leaseContract: { create: vi.fn(), update: vi.fn() },
  };
  const prismaMock = {
    user: { findUnique: vi.fn() },
    container: { findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn(), update: vi.fn() },
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

import { deleteContainerAction } from "./containers";
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
    const result = await deleteContainerAction("c1");
    expect(result.ok).toBe(false);
    expect(prismaMock.container.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.container.delete).not.toHaveBeenCalled();
  });

  test("MANAGER cannot write off a container either (ADMIN only)", async () => {
    actAs("MANAGER");
    const result = await deleteContainerAction("c1");
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
    const result = await deleteContainerAction("c1");
    expect(result.ok).toBe(false);
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
      id: "l1", contractNumber: "LC-1", allowedReturnLocodes: "RULED", dailyRateUsd: 2.5,
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

describe("lease extension", () => {
  test("refuses a new Per Diem rate: it would be applied retroactively to days already accrued", async () => {
    prismaMock.leaseContract.findUnique.mockResolvedValue({ id: "l1", status: "ACTIVE", contractNumber: "LC-1", endDate: d("2026-11-05"), dailyRateUsd: 2.5, items: [] });

    const result = await extendLeaseAction("l1", { months: 6, newDailyRateUsd: 3.1 });

    expect(result.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
