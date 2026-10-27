import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { describeDbError } from "@/lib/db-errors";
import { createContainer, createLease, resetDomain, tripData } from "../../test/fixtures";

beforeEach(() => resetDomain(prisma));
afterAll(() => prisma.$disconnect());

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Ожидалась ошибка БД, но запрос прошёл");
}

describe("1.4 one active operation per container — enforced by partial unique indexes", () => {
  test("a second ACTIVE One-Way for the same container is rejected by the database", async () => {
    const c = await createContainer(prisma);
    await prisma.oneWayTrip.create({ data: tripData(c.id) });
    const error = await failure(prisma.oneWayTrip.create({ data: tripData(c.id, { bookingRef: "OW-DUP" }) }));
    expect(describeDbError(error)).toBe("Контейнер уже в активном рейсе One-Way — обновите страницу");
  });

  test("a closed trip does not block a new one", async () => {
    const c = await createContainer(prisma);
    await prisma.oneWayTrip.create({ data: tripData(c.id, { status: "COMPLETED", actualReturnDate: new Date("2026-10-20T00:00:00Z") }) });
    await expect(prisma.oneWayTrip.create({ data: tripData(c.id) })).resolves.toBeTruthy();
  });

  test("a container cannot be on hire under two open lease items", async () => {
    const c = await createContainer(prisma);
    await createLease(prisma, [c.id]);
    const error = await failure(createLease(prisma, [c.id]));
    expect(describeDbError(error)).toBe("Контейнер уже числится в действующем договоре аренды — обновите страницу");
  });
});

describe("1.5 CHECK constraints", () => {
  test("unknown operational status is rejected with a readable message", async () => {
    const error = await failure(createContainer(prisma, { operationalStatus: "LOST_AT_SEA" }));
    expect(describeDbError(error)).toMatch(/^Данные не прошли проверку базы данных/);
  });

  test("negative money is rejected", async () => {
    const c = await createContainer(prisma);
    await expect(prisma.container.update({ where: { id: c.id }, data: { totalRevenueUsd: "-0.01" } })).rejects.toThrow(/Container_money_nonnegative_check/);
  });

  test("a written-off container must carry deletedAt and vice versa", async () => {
    const c = await createContainer(prisma);
    await expect(prisma.container.update({ where: { id: c.id }, data: { operationalStatus: "WRITTEN_OFF" } })).rejects.toThrow(/writeoff_consistency/);
  });

  test("user role must be ADMIN / MANAGER / INSPECTOR; the default is INSPECTOR", async () => {
    await expect(prisma.user.create({ data: { email: "x@test.local", name: "X", role: "ROOT", passwordHash: "x" } })).rejects.toThrow(/User_role_check/);
    const u = await prisma.user.create({ data: { email: "y@test.local", name: "Y", passwordHash: "x" } });
    expect(u.role).toBe("INSPECTOR");
  });
});

describe("1.3 history cannot be cascaded away", () => {
  test("physical DELETE of a container with history is refused (ON DELETE RESTRICT)", async () => {
    const c = await createContainer(prisma);
    await prisma.containerEvent.create({ data: { containerId: c.id, type: "GATE_IN", occurredAt: new Date(), description: "Gate-In" } });
    const error = await failure(prisma.container.delete({ where: { id: c.id } }));
    expect(describeDbError(error)).toBe("Запись связана с историей операций и не может быть удалена");
    expect(await prisma.containerEvent.count({ where: { containerId: c.id } })).toBe(1);
  });
});

describe("money is stored as numeric(12,2)", () => {
  test("3 × $0.10 × 27 days written in cents reads back as exactly 8.1", async () => {
    const c = await createContainer(prisma);
    for (let i = 0; i < 3; i++) await prisma.container.update({ where: { id: c.id }, data: { totalRevenueUsd: { increment: "2.70" } } });
    const row = await prisma.container.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.totalRevenueUsd).toBe(8.1);
    const raw = await prisma.$queryRaw<{ v: string }[]>`SELECT "totalRevenueUsd"::text AS v FROM "Container" WHERE id = ${c.id}`;
    expect(raw[0].v).toBe("8.10");
  });

  test("nested reads (include) also come back as plain numbers", async () => {
    const c = await createContainer(prisma);
    await createLease(prisma, [c.id]);
    const withLease = await prisma.container.findUniqueOrThrow({
      where: { id: c.id },
      include: { leaseItems: { include: { lease: { include: { ratePeriods: true } } } } },
    });
    expect(typeof withLease.leaseItems[0].lease.dailyRateUsd).toBe("number");
    expect(withLease.leaseItems[0].lease.ratePeriods[0].dailyRateUsd).toBe(4);
  });
});
