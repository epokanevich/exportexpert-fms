import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", async () => {
  const { currentSession } = await import("../../test/session-mock");
  return { requireSession: vi.fn(async () => currentSession), getSession: vi.fn(async () => currentSession) };
});

import { prisma } from "@/lib/prisma";
import { createLeaseAction, extendLeaseAction, offHireAction } from "./leases";
import { activateDueLeases } from "@/lib/lease-activation";
import { createContainer, createUser, resetDomain } from "../../test/fixtures";
import { actAsUser } from "../../test/session-mock";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

beforeEach(async () => {
  await resetDomain(prisma);
  actAsUser(await createUser(prisma, "MANAGER"));
});
afterEach(() => vi.useRealTimers());
afterAll(() => prisma.$disconnect());

function leaseInput(containerIds: string[], startDate: string, endDate: string) {
  return {
    contractNumber: `LC-INT/${Math.random().toString(36).slice(2, 7)}`,
    lesseeName: "ООО Арендатор",
    contactPerson: "Петров",
    startDate,
    endDate,
    autoRenewal: false,
    dailyRateUsd: 4,
    depositUsd: 0,
    allowedReturnLocodes: ["RUVVO"],
    containerIds,
  };
}

describe("D-19: a lease with a future On-Hire date is SCHEDULED", () => {
  test("containers are reserved (not on hire) until the On-Hire date, then activated", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T09:00:00.000Z"));
    const c = await createContainer(prisma);

    const result = await createLeaseAction(leaseInput([c.id], "2026-11-10", "2027-05-10"));
    expect(result).toMatchObject({ ok: true });

    const lease = await prisma.leaseContract.findFirstOrThrow({ include: { ratePeriods: true } });
    expect(lease.status).toBe("SCHEDULED");
    expect(lease.ratePeriods).toHaveLength(1);
    expect((await prisma.container.findUniqueOrThrow({ where: { id: c.id } })).operationalStatus).toBe("RESERVED");

    expect(await activateDueLeases(new Date("2026-11-09T20:00:00.000Z"))).toBe(0); // 23:00 МСК 09.11 — ещё рано
    expect(await activateDueLeases(new Date("2026-11-09T21:30:00.000Z"))).toBe(1); // 00:30 МСК 10.11
    expect(await activateDueLeases(new Date("2026-11-09T21:31:00.000Z"))).toBe(0); // идемпотентно

    expect((await prisma.leaseContract.findUniqueOrThrow({ where: { id: lease.id } })).status).toBe("ACTIVE");
    const unit = await prisma.container.findUniqueOrThrow({ where: { id: c.id }, include: { events: true } });
    expect(unit.operationalStatus).toBe("LONG_TERM_LEASE");
    expect(unit.events.map((e) => e.type)).toEqual(expect.arrayContaining(["STATUS_CHANGE", "LEASE_ON_HIRE"]));
  });

  test("a reserved container cannot be issued elsewhere", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T09:00:00.000Z"));
    const c = await createContainer(prisma);
    await createLeaseAction(leaseInput([c.id], "2026-11-10", "2027-05-10"));
    const second = await createLeaseAction(leaseInput([c.id], "2026-10-27", "2027-05-10"));
    expect(second.ok).toBe(false);
  });
});

describe("D-08: extension with a new rate, then Off-Hire on real PostgreSQL", () => {
  test("273 days → 182 × $4 + 91 × $6 = $1 274 in revenue; earlier accrual unchanged", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T09:00:00.000Z"));
    const c = await createContainer(prisma);
    expect(await createLeaseAction(leaseInput([c.id], "2026-01-01", "2026-07-01"))).toMatchObject({ ok: true });
    const lease = await prisma.leaseContract.findFirstOrThrow({ include: { items: true } });

    vi.setSystemTime(new Date("2026-07-02T09:00:00.000Z"));
    expect(await extendLeaseAction(lease.id, { months: 6, newDailyRateUsd: 6, rateEffectiveFrom: "2026-07-02" })).toMatchObject({ ok: true });
    const retro = await extendLeaseAction(lease.id, { months: 1, newDailyRateUsd: 7, rateEffectiveFrom: "2026-06-30" });
    expect(retro.ok).toBe(false);

    vi.setSystemTime(new Date("2026-10-01T09:00:00.000Z"));
    const off = await offHireAction(lease.id, { itemIds: [lease.items[0].id], returnDate: "2026-10-01", returnLocode: "RUVVO", terminal: "ВМТП", condition: "SOUND" });
    expect(off).toMatchObject({ ok: true });

    const unit = await prisma.container.findUniqueOrThrow({ where: { id: c.id } });
    expect(unit.totalRevenueUsd).toBe(1274);
    const periods = await prisma.leaseRatePeriod.findMany({ where: { leaseId: lease.id }, orderBy: { effectiveFrom: "asc" } });
    expect(periods.map((p) => [p.effectiveFrom.toISOString().slice(0, 10), p.dailyRateUsd])).toEqual([
      ["2026-01-01", 4],
      ["2026-07-02", 6],
    ]);
    expect((await prisma.leaseContract.findUniqueOrThrow({ where: { id: lease.id } })).status).toBe("COMPLETED");
    expect(periods[0].effectiveFrom).toEqual(d("2026-01-01"));
  });
});
