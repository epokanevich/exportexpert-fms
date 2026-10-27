import { describe, expect, test } from "vitest";
import { addMonths, latestBusinessDate, toLocalDateInput } from "./dates";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("addMonths", () => {
  test("clamps to the last day of a shorter month instead of overflowing", () => {
    expect(addMonths(d("2026-01-31"), 1)).toEqual(d("2026-02-28"));
    expect(addMonths(d("2026-03-31"), 1)).toEqual(d("2026-04-30"));
  });

  test("handles leap years", () => {
    expect(addMonths(d("2028-01-31"), 1)).toEqual(d("2028-02-29"));
    expect(addMonths(d("2028-02-29"), 12)).toEqual(d("2029-02-28"));
  });

  test("keeps the day when it exists and supports multi-year spans", () => {
    expect(addMonths(d("2026-10-26"), 12)).toEqual(d("2027-10-26"));
    expect(addMonths(d("2026-08-31"), 2)).toEqual(d("2026-10-31"));
  });
});

describe("latestBusinessDate", () => {
  test("accepts the Vladivostok calendar day while UTC is still on the previous day", () => {
    // 08:30 во Владивостоке 27.10 = 22:30 UTC 26.10
    expect(latestBusinessDate(new Date("2026-10-26T22:30:00.000Z"))).toEqual(d("2026-10-27"));
  });

  test("equals the UTC day during the European working day", () => {
    expect(latestBusinessDate(new Date("2026-10-27T09:00:00.000Z"))).toEqual(d("2026-10-27"));
  });
});

describe("toLocalDateInput", () => {
  test("uses the local calendar date, not the UTC one", () => {
    const local = new Date(2026, 9, 27, 0, 30); // 27.10 00:30 по местному времени
    expect(toLocalDateInput(local)).toBe("2026-10-27");
  });
});
