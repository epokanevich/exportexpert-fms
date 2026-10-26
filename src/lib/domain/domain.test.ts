import { describe, expect, test } from "vitest";
import { buildBic, computeCheckDigit, formatBic, normalizeBic, validateBic } from "@/lib/iso6346";
import { computeTripTiming } from "./one-way";
import { computeLeaseMetrics, rentalDaysInRange } from "./lease";
import { cscStateOf, issueBlockReason, storageStateOf, unitEconomicsOf } from "./container";
import { computeFleetKpi } from "./fleet";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = new Date("2026-10-26T12:00:00.000Z");

describe("ISO 6346", () => {
  test("computes the check digit of the canonical example CSQU 305438 → 3", () => {
    expect(computeCheckDigit("CSQU305438")).toBe(3);
  });

  test("computes the check digit of a known real container MSKU 907032 → 3", () => {
    expect(computeCheckDigit("MSKU907032")).toBe(3);
  });

  test("maps a remainder of 10 to check digit 0", () => {
    // Находим серию с остатком 10 перебором и проверяем, что результат — 0.
    const serial = Array.from({ length: 1000 }, (_, i) => String(i).padStart(6, "0")).find((s) => {
      const code = `TKRU${s}`;
      let sum = 0;
      const letters: Record<string, number> = { T: 31, K: 21, R: 29, U: 32 };
      for (let i = 0; i < 10; i++) sum += (i < 4 ? letters[code[i]] : Number(code[i])) * 2 ** i;
      return sum % 11 === 10;
    });
    expect(serial).toBeDefined();
    expect(computeCheckDigit(`TKRU${serial}`)).toBe(0);
  });

  test("builds and validates a full code, tolerating spaces and dashes", () => {
    const bic = buildBic("TKRU", "204812");
    expect(validateBic(formatBic(bic)).valid).toBe(true);
    expect(normalizeBic("tkru 204812-" + bic.at(-1))).toBe(bic);
  });

  test("rejects a wrong check digit and reports the expected one", () => {
    const result = validateBic("CSQU 305438-4");
    expect(result.valid).toBe(false);
    expect(result.expectedCheckDigit).toBe(3);
  });

  test("warns (but accepts) a non-standard category identifier", () => {
    const result = validateBic(buildBic("EXEX", "402918"));
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  test("rejects malformed input", () => {
    expect(validateBic("ABC123").valid).toBe(false);
  });
});

describe("One-Way timing", () => {
  const base = { handoverDate: d("2026-09-20"), freeDays: 30, deadlineDate: d("2026-10-20"), actualReturnDate: null, detentionRatePerDayUsd: 15 };

  test("active trip past deadline becomes OVERDUE with accrued detention", () => {
    const t = computeTripTiming({ ...base, status: "ACTIVE" }, NOW);
    expect(t.status).toBe("OVERDUE");
    expect(t.overdueDays).toBe(6);
    expect(t.detentionUsd).toBe(90);
  });

  test("trip with 3 days left is ACTIVE and hot", () => {
    const t = computeTripTiming({ ...base, status: "ACTIVE", deadlineDate: d("2026-10-29") }, NOW);
    expect(t.status).toBe("ACTIVE");
    expect(t.daysLeft).toBe(3);
    expect(t.isHot).toBe(true);
  });

  test("completed trip freezes detention at the actual return date", () => {
    const t = computeTripTiming({ ...base, status: "COMPLETED", actualReturnDate: d("2026-10-24") }, NOW);
    expect(t.status).toBe("COMPLETED");
    expect(t.overdueDays).toBe(4);
    expect(t.detentionUsd).toBe(60);
  });
});

describe("Lease accruals", () => {
  test("bills from On-Hire through today inclusive", () => {
    expect(rentalDaysInRange({ onHireDate: d("2026-10-01"), offHireDate: null }, d("2026-10-01"), NOW)).toBe(26);
  });

  test("does not bill the Off-Hire day", () => {
    expect(rentalDaysInRange({ onHireDate: d("2026-10-01"), offHireDate: d("2026-10-11") }, d("2026-10-01"), NOW)).toBe(10);
  });

  test("computes monthly and total accruals for a package", () => {
    const m = computeLeaseMetrics(
      {
        status: "ACTIVE",
        endDate: d("2026-11-05"),
        dailyRateUsd: 2.5,
        paymentStatus: "PAID",
        items: [
          { onHireDate: d("2026-09-01"), offHireDate: null },
          { onHireDate: d("2026-09-01"), offHireDate: null },
        ],
      },
      NOW,
    );
    expect(m.accruedThisMonthUsd).toBe(26 * 2.5 * 2);
    expect(m.accruedTotalUsd).toBe(56 * 2.5 * 2);
    expect(m.expiryLevel).toBe("CRITICAL");
    expect(m.needsAttention).toBe(true);
  });
});

describe("Container state", () => {
  test("flags CSC plate expiring within 30 days and expired ones", () => {
    expect(cscStateOf(d("2026-11-10"), NOW).level).toBe("EXPIRING");
    expect(cscStateOf(d("2026-10-01"), NOW).level).toBe("EXPIRED");
    expect(cscStateOf(d("2027-06-01"), NOW).level).toBe("OK");
  });

  test("computes idle days and storage cost on stock", () => {
    const s = storageStateOf({ operationalStatus: "AVAILABLE", storageStartDate: d("2026-09-11"), storageRatePerDayUsd: 3 }, NOW);
    expect(s.idleDays).toBe(45);
    expect(s.isIdleTooLong).toBe(true);
    expect(s.storageCostUsd).toBe(135);
  });

  test("allows issuing a sound container on stock with a valid CSC plate", () => {
    expect(issueBlockReason({ operationalStatus: "AVAILABLE", techStatus: "SOUND", cscPlateExpiry: d("2027-01-01") }, NOW)).toBeNull();
  });

  test("blocks issuing when the CSC plate has expired", () => {
    expect(issueBlockReason({ operationalStatus: "AVAILABLE", techStatus: "SOUND", cscPlateExpiry: d("2026-10-20") }, NOW)).toContain("КБК (CSC) просрочена на 6 дн.");
  });

  test("blocks issuing damaged or off-stock containers", () => {
    expect(issueBlockReason({ operationalStatus: "AVAILABLE", techStatus: "DAMAGED", cscPlateExpiry: d("2027-01-01") }, NOW)).toContain("Поврежден");
    expect(issueBlockReason({ operationalStatus: "ONE_WAY", techStatus: "SOUND", cscPlateExpiry: d("2027-01-01") }, NOW)).toBe("Контейнер не на стоке");
  });

  test("computes unit economics", () => {
    const e = unitEconomicsOf({ purchasePriceUsd: 3000, currentBookValueUsd: 2400, totalRevenueUsd: 2100, totalRepairCostUsd: 300 });
    expect(e.depreciationUsd).toBe(600);
    expect(e.netResultUsd).toBe(1200);
    expect(e.roi).toBeCloseTo(0.4);
  });
});

describe("Fleet KPI", () => {
  test("aggregates TEU, utilization and attention", () => {
    const kpi = computeFleetKpi(
      [
        { sizeType: "40HC", currentLocode: "RUVVO", operationalStatus: "ONE_WAY", techStatus: "SOUND", cscPlateExpiry: d("2028-01-01"), storageStartDate: null, storageRatePerDayUsd: null },
        { sizeType: "20DC", currentLocode: "CNSHA", operationalStatus: "AVAILABLE", techStatus: "DAMAGED", cscPlateExpiry: d("2026-11-01"), storageStartDate: d("2026-10-20"), storageRatePerDayUsd: 2 },
      ],
      [],
      [],
      NOW,
    );
    expect(kpi.totalUnits).toBe(2);
    expect(kpi.totalTeu).toBe(3);
    expect(kpi.utilizationRate).toBe(0.5);
    expect(kpi.attention).toEqual({ total: 1, csc: 1, repair: 1, idle: 0 });
    expect(kpi.byRegion.map((r) => r.region)).toEqual(["Владивосток", "Китай"]);
  });
});
