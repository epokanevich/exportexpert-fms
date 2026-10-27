import { describe, expect, test } from "vitest";
import { Prisma } from "@prisma/client";
import { fromDbMoney, mulRate, roundMoney, sumMoney, toCents, toDbMoney } from "./money";

describe("money: one rounding rule, arithmetic in whole cents", () => {
  test("D-29: 3 units × $0.10 × 27 days is exactly $8.10, not 8.100000000000001", () => {
    const perUnit = mulRate(0.1, 27);
    const total = sumMoney([perUnit, perUnit, perUnit]);
    expect(total).toBe(8.1);
    expect(toDbMoney(total)).toBe("8.10");
    expect(0.1 * 3 * 27).not.toBe(8.1); // так считалось раньше
  });

  test("float noise from old Float columns is removed", () => {
    expect(roundMoney(8.100000000000001)).toBe(8.1);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  test("rounds half away from zero to cents", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(1.004)).toBe(1);
  });

  test("accepts Prisma.Decimal and strings from the database", () => {
    expect(fromDbMoney(new Prisma.Decimal("1283.25"))).toBe(1283.25);
    expect(fromDbMoney("0.10")).toBe(0.1);
    expect(fromDbMoney(null)).toBeNull();
    expect(toCents(new Prisma.Decimal("-0.01"))).toBe(-1);
  });

  test("handles the numeric(12,2) range without losing cents", () => {
    expect(toDbMoney(9_999_999_999.99)).toBe("9999999999.99");
    expect(sumMoney([9_999_999_999.98, 0.01])).toBe(9_999_999_999.99);
  });

  test("mulRate: Per Diem × days for long terms stays exact", () => {
    expect(mulRate(2.5, 171)).toBe(427.5);
    expect(mulRate(4, 273)).toBe(1092);
    expect(mulRate(0.07, 365)).toBe(25.55);
  });

  test("toDbMoney always writes two decimals and rejects non-finite values", () => {
    expect(toDbMoney(0)).toBe("0.00");
    expect(toDbMoney(-12.5)).toBe("-12.50");
    expect(() => toDbMoney(Number.NaN)).toThrow();
    expect(() => toDbMoney(Number.POSITIVE_INFINITY)).toThrow();
  });
});
