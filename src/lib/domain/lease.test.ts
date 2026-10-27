import { describe, expect, test } from "vitest";
import { accrueItem, computeLeaseMetrics, currentRate, effectiveLeaseStatus, rateSegments } from "./lease";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = new Date("2026-10-26T12:00:00.000Z");

/** Договор с 01.01.2026 по $4, продлён 02.07.2026 с новой ставкой $6. */
const PERIODS = [
  { effectiveFrom: d("2026-01-01"), dailyRateUsd: 4 },
  { effectiveFrom: d("2026-07-02"), dailyRateUsd: 6 },
];

describe("Per Diem rate history (D-08)", () => {
  test("273 days: the first 182 are billed at $4, the remaining 91 at $6 — not 273 × $6", () => {
    const item = { onHireDate: d("2026-01-01"), offHireDate: d("2026-10-01") }; // 273 оплачиваемых дня
    const result = accrueItem(item, PERIODS, item.onHireDate, d("2026-10-01"));

    expect(result.days).toBe(273);
    expect(result.segments.map((s) => [s.days, s.rateUsd])).toEqual([
      [182, 4],
      [91, 6],
    ]);
    expect(result.amountUsd).toBe(182 * 4 + 91 * 6); // 1 274
    expect(result.amountUsd).not.toBe(273 * 6);
  });

  test("a new rate does not change days accrued before it took effect", () => {
    const item = { onHireDate: d("2026-01-01"), offHireDate: null };
    const before = accrueItem(item, PERIODS.slice(0, 1), d("2026-01-01"), d("2026-07-01"));
    const after = accrueItem(item, PERIODS, d("2026-01-01"), d("2026-07-01"));
    expect(after.amountUsd).toBe(before.amountUsd);
    expect(after.amountUsd).toBe(182 * 4);
  });

  test("clips segments to the requested range (calculator: current month)", () => {
    const segs = rateSegments(PERIODS, d("2026-06-15"), d("2026-07-10"));
    expect(segs).toEqual([
      { from: d("2026-06-15"), to: d("2026-07-01"), rateUsd: 4 },
      { from: d("2026-07-02"), to: d("2026-07-10"), rateUsd: 6 },
    ]);
  });

  test("days before the first period are billed at the first rate", () => {
    const r = accrueItem({ onHireDate: d("2025-12-30"), offHireDate: d("2026-01-03") }, PERIODS, d("2025-01-01"), NOW);
    expect(r.days).toBe(4);
    expect(r.amountUsd).toBe(16);
  });

  test("cents stay exact for small rates (D-29)", () => {
    const periods = [{ effectiveFrom: d("2026-01-01"), dailyRateUsd: 0.1 }];
    const item = { onHireDate: d("2026-01-01"), offHireDate: d("2026-01-28") };
    expect(accrueItem(item, periods, item.onHireDate, NOW).amountUsd).toBe(2.7);
  });

  test("currentRate picks the latest period already in force", () => {
    expect(currentRate(PERIODS, 4, d("2026-07-01"))).toBe(4);
    expect(currentRate(PERIODS, 4, d("2026-07-02"))).toBe(6);
    expect(currentRate([], 2.5, NOW)).toBe(2.5);
  });
});

describe("lease metrics with rate periods", () => {
  test("total accrual and run-rate follow the periods", () => {
    const m = computeLeaseMetrics(
      {
        status: "ACTIVE",
        startDate: d("2026-01-01"),
        endDate: d("2027-01-01"),
        dailyRateUsd: 6,
        paymentStatus: "PAID",
        ratePeriods: PERIODS,
        items: [{ onHireDate: d("2026-01-01"), offHireDate: null }],
      },
      NOW,
    );
    // 01.01–01.07 = 182 дн. × $4; 02.07–26.10 = 117 дн. × $6
    expect(m.accruedTotalUsd).toBe(182 * 4 + 117 * 6);
    expect(m.accruedThisMonthUsd).toBe(26 * 6);
    expect(m.monthlyRunRateUsd).toBe(6 * 31);
  });
});

describe("scheduled lease (D-19)", () => {
  const future = {
    status: "SCHEDULED",
    startDate: d("2026-11-10"),
    endDate: d("2027-05-10"),
    dailyRateUsd: 3,
    paymentStatus: "PENDING",
    items: [{ onHireDate: d("2026-11-10"), offHireDate: null }],
  };

  test("is not on hire and earns nothing before its On-Hire date", () => {
    const m = computeLeaseMetrics(future, NOW);
    expect(m.activeUnits).toBe(0);
    expect(m.monthlyRunRateUsd).toBe(0);
    expect(m.accruedTotalUsd).toBe(0);
    expect(effectiveLeaseStatus(future, NOW)).toBe("SCHEDULED");
  });

  test("becomes active from the On-Hire date", () => {
    const onDay = new Date("2026-11-10T08:00:00.000Z");
    expect(effectiveLeaseStatus(future, onDay)).toBe("ACTIVE");
    expect(computeLeaseMetrics(future, onDay).activeUnits).toBe(1);
  });
});
