import { describe, expect, test } from "vitest";
import { damageLineSchema, describeDamage, eorFromDamages } from "./damage";

describe("CEDEX damage lines (2.5)", () => {
  test("a valid line is normalised to upper case", () => {
    const line = damageLineSchema.parse({ locationCode: "lx2n", component: "Боковая панель", damageCode: "dt", repairCode: "sn", lengthCm: "30", widthCm: "12", quantity: "1", costUsd: "180.5" });
    expect(line).toEqual({ locationCode: "LX2N", component: "Боковая панель", damageCode: "DT", repairCode: "SN", lengthCm: 30, widthCm: 12, quantity: 1, costUsd: 180.5 });
  });

  test("empty optional numbers stay empty (z.coerce.number(\"\") would give 0)", () => {
    const line = damageLineSchema.parse({ locationCode: "BX1N", component: "Пол", damageCode: "CK", lengthCm: "", widthCm: "", quantity: "1", costUsd: "" });
    expect(line).toMatchObject({ lengthCm: null, widthCm: null, costUsd: null });
  });

  test("codes must follow the CEDEX format", () => {
    expect(damageLineSchema.safeParse({ locationCode: "L2", component: "Пол", damageCode: "DT", quantity: 1 }).success).toBe(false);
    expect(damageLineSchema.safeParse({ locationCode: "BX1N", component: "Пол", damageCode: "DENT", quantity: 1 }).success).toBe(false);
    expect(damageLineSchema.safeParse({ locationCode: "BX1N", component: "", damageCode: "HO", quantity: 1 }).success).toBe(false);
    expect(damageLineSchema.safeParse({ locationCode: "BX1N", component: "Пол", damageCode: "HO", quantity: 0 }).success).toBe(false);
  });

  test("EOR is the sum of line costs, in cents", () => {
    expect(eorFromDamages([{ costUsd: 0.1 }, { costUsd: 0.2 }, { costUsd: null }])).toBe(0.3);
    expect(eorFromDamages([])).toBeNull();
    expect(eorFromDamages([{ costUsd: null }])).toBeNull();
  });

  test("a readable description for the journal", () => {
    expect(describeDamage({ locationCode: "LX2N", component: "Боковая панель", damageCode: "HO", repairCode: "PA", lengthCm: 30, widthCm: 12, quantity: 1, costUsd: 240 }))
      .toBe("LX2N Боковая панель — HO (пробоина) 30×12 см → PA (заплата), $240");
    expect(describeDamage({ locationCode: "DX1N", component: "Уплотнитель двери", damageCode: "ZZ", repairCode: null, lengthCm: null, widthCm: null, quantity: 2, costUsd: null }))
      .toBe("DX1N Уплотнитель двери — ZZ ×2");
  });
});
