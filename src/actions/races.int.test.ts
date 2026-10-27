import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", async () => {
  const { currentSession } = await import("../../test/session-mock");
  return { requireSession: vi.fn(async () => currentSession), getSession: vi.fn(async () => currentSession) };
});

import { prisma } from "@/lib/prisma";
import { createOneWayAction, registerOneWayReturnAction } from "./one-way";
import { createLeaseAction, extendLeaseAction, offHireAction } from "./leases";
import { gateOutAction } from "./inspector";
import { createContainer, createLease, createUser, resetDomain, tripData } from "../../test/fixtures";
import { actAsUser } from "../../test/session-mock";

beforeEach(async () => {
  await resetDomain(prisma);
  actAsUser(await createUser(prisma, "MANAGER"));
});
afterAll(() => prisma.$disconnect());

const tripInput = (containerId: string, bookingRef: string) => ({
  containerId, counterpartyName: "ООО Гонка", bookingRef, dropoffLocode: "RUMOW", dropoffTerminal: "ТЛЦ Ворсино",
  handoverDate: "2026-10-01", freeDays: 10, feeUsd: 100, detentionRatePerDayUsd: 20,
});

describe("5.3 races on real PostgreSQL (D-03 / D-04 retest)", () => {
  test("5 parallel Gate-In of one trip: exactly one accepted, detention booked once", async () => {
    const c = await createContainer(prisma, { operationalStatus: "ONE_WAY", storageStartDate: null });
    const trip = await prisma.oneWayTrip.create({ data: tripData(c.id, { handoverDate: new Date("2026-09-17T00:00:00Z"), deadlineDate: new Date("2026-10-17T00:00:00Z"), detentionRatePerDayUsd: "20.00" }) });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => registerOneWayReturnAction(trip.id, { returnDate: "2026-10-27", terminal: "ТЛЦ Ворсино", condition: "SOUND" })),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const unit = await prisma.container.findUniqueOrThrow({ where: { id: c.id }, include: { events: true } });
    expect(unit.totalRevenueUsd).toBe(200); // 10 дней × $20 — один раз
    expect(unit.events.filter((e) => e.type === "ONE_WAY_IN")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: "ONE_WAY_RETURN" } })).toBe(1);
  });

  test("double issue of one container into One-Way: one trip, fee booked once", async () => {
    const c = await createContainer(prisma);
    const results = await Promise.all([createOneWayAction(tripInput(c.id, "OW-A")), createOneWayAction(tripInput(c.id, "OW-B"))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.oneWayTrip.count({ where: { containerId: c.id, status: "ACTIVE" } })).toBe(1);
    expect((await prisma.container.findUniqueOrThrow({ where: { id: c.id } })).totalRevenueUsd).toBe(100);
  });

  test("One-Way issue racing a lease and a Gate-Out for the same container: only one wins", async () => {
    const c = await createContainer(prisma);
    const results = await Promise.all([
      createOneWayAction(tripInput(c.id, "OW-C")),
      createLeaseAction({
        contractNumber: "LC-RACE/1", lesseeName: "ООО Арендатор", contactPerson: "Петров", startDate: "2026-10-01", endDate: "2027-10-01",
        autoRenewal: false, dailyRateUsd: 4, depositUsd: 0, allowedReturnLocodes: ["RUVVO"], containerIds: [c.id],
      }),
      gateOutAction(c.id, { destinationLocode: "RUMOW" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const [trips, items] = await Promise.all([prisma.oneWayTrip.count({ where: { containerId: c.id } }), prisma.leaseItem.count({ where: { containerId: c.id } })]);
    expect(trips + items).toBeLessThanOrEqual(1);
  });

  test("triple Off-Hire of the same unit: rent booked once", async () => {
    const c = await createContainer(prisma, { operationalStatus: "LONG_TERM_LEASE", storageStartDate: null });
    const lease = await createLease(prisma, [c.id], { allowedReturnLocodes: "RULED" });
    const item = await prisma.leaseItem.findFirstOrThrow({ where: { leaseId: lease.id } });

    const results = await Promise.all(
      Array.from({ length: 3 }, () => offHireAction(lease.id, { itemIds: [item.id], returnDate: "2026-01-11", returnLocode: "RULED", terminal: "ПКТ", condition: "SOUND" })),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await prisma.container.findUniqueOrThrow({ where: { id: c.id } })).totalRevenueUsd).toBe(40); // 10 дней × $4
  });

  test("the database itself refuses a second ACTIVE trip even when application checks are bypassed", async () => {
    const c = await createContainer(prisma);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => prisma.oneWayTrip.create({ data: tripData(c.id, { bookingRef: `RAW-${i}` }) })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.oneWayTrip.count({ where: { containerId: c.id, status: "ACTIVE" } })).toBe(1);
  });

  test("review HIGH: parallel Off-Hire of different units closes the lease (remaining is counted inside the transaction)", async () => {
    const units = await Promise.all([1, 2, 3].map(() => createContainer(prisma, { operationalStatus: "LONG_TERM_LEASE", storageStartDate: null })));
    const lease = await createLease(prisma, units.map((u) => u.id), { allowedReturnLocodes: "RULED" });
    const items = await prisma.leaseItem.findMany({ where: { leaseId: lease.id }, orderBy: { id: "asc" } });

    const off = (ids: string[]) => offHireAction(lease.id, { itemIds: ids, returnDate: "2026-01-11", returnLocode: "RULED", terminal: "ПКТ", condition: "SOUND" });
    const results = await Promise.all([off([items[0].id, items[1].id]), off([items[2].id])]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(await prisma.leaseItem.count({ where: { leaseId: lease.id, offHireDate: null } })).toBe(0);
    expect((await prisma.leaseContract.findUniqueOrThrow({ where: { id: lease.id } })).status).toBe("COMPLETED");
  });

  test("review MEDIUM: an extension racing the final Off-Hire never touches a closed lease", async () => {
    const c = await createContainer(prisma, { operationalStatus: "LONG_TERM_LEASE", storageStartDate: null });
    const lease = await createLease(prisma, [c.id], { allowedReturnLocodes: "RULED" });
    const item = await prisma.leaseItem.findFirstOrThrow({ where: { leaseId: lease.id } });
    await Promise.all([
      offHireAction(lease.id, { itemIds: [item.id], returnDate: "2026-01-11", returnLocode: "RULED", terminal: "ПКТ", condition: "SOUND" }),
      extendLeaseAction(lease.id, { months: 6 }),
    ]);
    const after = await prisma.leaseContract.findUniqueOrThrow({ where: { id: lease.id } });
    if (after.status === "COMPLETED") expect(after.offHireSurvey).toBe("SIGNED");
  });
});
