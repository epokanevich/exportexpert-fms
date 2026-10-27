import { describe, expect, test } from "vitest";
import { computeDeadline, computeTripTiming, FREE_TIME_CONVENTION } from "./one-way";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const ON_27_OCT = new Date("2026-10-27T09:00:00.000Z");

/** Демо-рейсы из отчёта приёмки: EXEX 402918 (05.09, 45 дн., $15) и FESU 518204 (17.09, 30 дн., $20). */
const EXEX = { handoverDate: d("2026-09-05"), freeDays: 45, rate: 15 };
const FESU = { handoverDate: d("2026-09-17"), freeDays: 30, rate: 20 };

function detentionOn27Oct(trip: typeof EXEX, convention: Parameters<typeof computeDeadline>[2]) {
  const deadlineDate = computeDeadline(trip.handoverDate, trip.freeDays, convention);
  const timing = computeTripTiming(
    { status: "ACTIVE", handoverDate: trip.handoverDate, freeDays: trip.freeDays, deadlineDate, actualReturnDate: null, detentionRatePerDayUsd: trip.rate },
    ON_27_OCT,
  );
  return { deadline: deadlineDate.toISOString().slice(0, 10), overdueDays: timing.overdueDays, detentionUsd: timing.detentionUsd };
}

describe("D-20 Free Time convention (one switch, both conventions tested)", () => {
  test("current convention: the day after Gate-Out is day 1 (N + 1 calendar days free)", () => {
    expect(detentionOn27Oct(EXEX, "DAY_AFTER_GATE_OUT")).toEqual({ deadline: "2026-10-20", overdueDays: 7, detentionUsd: 105 });
    expect(detentionOn27Oct(FESU, "DAY_AFTER_GATE_OUT")).toEqual({ deadline: "2026-10-17", overdueDays: 10, detentionUsd: 200 });
  });

  test("industry convention: the Gate-Out day is day 1 (deadline one day earlier, +1 day of detention)", () => {
    expect(detentionOn27Oct(EXEX, "GATE_OUT_DAY_IS_DAY_1")).toEqual({ deadline: "2026-10-19", overdueDays: 8, detentionUsd: 120 });
    expect(detentionOn27Oct(FESU, "GATE_OUT_DAY_IS_DAY_1")).toEqual({ deadline: "2026-10-16", overdueDays: 11, detentionUsd: 220 });
  });

  test("1 free day under the industry convention = only the Gate-Out day itself", () => {
    expect(computeDeadline(d("2026-10-01"), 1, "GATE_OUT_DAY_IS_DAY_1")).toEqual(d("2026-10-01"));
    expect(computeDeadline(d("2026-10-01"), 1, "DAY_AFTER_GATE_OUT")).toEqual(d("2026-10-02"));
  });

  test("the free-days progress counts the Gate-Out day as used under the industry convention", () => {
    const deadlineDate = computeDeadline(d("2026-10-27"), 10, "GATE_OUT_DAY_IS_DAY_1");
    const t = computeTripTiming({ status: "ACTIVE", handoverDate: d("2026-10-27"), freeDays: 10, deadlineDate, actualReturnDate: null, detentionRatePerDayUsd: 10 }, ON_27_OCT);
    expect(t.daysLeft).toBe(9);
    expect(t.freeDaysUsedRatio).toBeCloseTo(0.1);
  });

  test("the default convention is a single constant", () => {
    expect(["DAY_AFTER_GATE_OUT", "GATE_OUT_DAY_IS_DAY_1"]).toContain(FREE_TIME_CONVENTION);
    expect(computeDeadline(EXEX.handoverDate, EXEX.freeDays)).toEqual(computeDeadline(EXEX.handoverDate, EXEX.freeDays, FREE_TIME_CONVENTION));
  });
});
