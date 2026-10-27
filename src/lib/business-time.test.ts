import { describe, expect, test } from "vitest";
import { businessToday, calendarDateIn, latestBusinessDate, resolveTimeZone } from "./business-time";
import { formatDateTime } from "./format";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("business time zone (D-28)", () => {
  test("00:30 Moscow time is already the next day for the business", () => {
    const at = new Date("2026-10-26T21:30:00.000Z"); // 27.10 00:30 МСК
    expect(businessToday(at, "Europe/Moscow")).toEqual(d("2026-10-27"));
  });

  test("23:50 UTC is the next calendar day in Moscow", () => {
    const at = new Date("2026-10-26T23:50:00.000Z"); // 27.10 02:50 МСК
    expect(businessToday(at, "Europe/Moscow")).toEqual(d("2026-10-27"));
  });

  test("23:59 Moscow time is still the same day", () => {
    expect(businessToday(new Date("2026-10-26T20:59:00.000Z"), "Europe/Moscow")).toEqual(d("2026-10-26"));
  });

  test("the zone is configurable", () => {
    const at = new Date("2026-10-26T15:30:00.000Z");
    expect(calendarDateIn("Asia/Vladivostok", at)).toEqual(d("2026-10-27")); // 01:30 27.10
    expect(calendarDateIn("Europe/Moscow", at)).toEqual(d("2026-10-26"));
  });

  test("an invalid zone falls back to Europe/Moscow instead of crashing", () => {
    expect(resolveTimeZone("Mars/Olympus")).toBe("Europe/Moscow");
    expect(resolveTimeZone(undefined)).toBe("Europe/Moscow");
    expect(resolveTimeZone("Asia/Yekaterinburg")).toBe("Asia/Yekaterinburg");
  });

  test("D-06: the latest acceptable operation date is today in the easternmost zone (Vladivostok)", () => {
    const at = new Date("2026-10-26T22:30:00.000Z"); // 01:30 МСК 27.10, 08:30 Владивосток 27.10
    expect(latestBusinessDate(at, "Europe/Moscow")).toEqual(d("2026-10-27"));
    const evening = new Date("2026-10-26T15:30:00.000Z"); // 18:30 МСК 26.10, 01:30 Владивосток 27.10
    expect(latestBusinessDate(evening, "Europe/Moscow")).toEqual(d("2026-10-27"));
    expect(businessToday(evening, "Europe/Moscow")).toEqual(d("2026-10-26"));
  });

  test("event timestamps are printed in the business zone", () => {
    expect(formatDateTime(new Date("2026-10-26T21:30:00.000Z"), "Europe/Moscow")).toBe("27.10.2026 00:30");
    expect(formatDateTime(new Date("2026-10-26T23:50:00.000Z"), "Asia/Vladivostok")).toBe("27.10.2026 09:50");
  });
});
