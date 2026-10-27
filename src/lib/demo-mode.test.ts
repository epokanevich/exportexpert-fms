import { describe, expect, test } from "vitest";
import { isDemoMode } from "./demo-mode";

describe("DEMO_MODE flag (3.5: safe default)", () => {
  test("is OFF when the variable is missing — a fresh production deploy never exposes demo credentials", () => {
    expect(isDemoMode({})).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "" })).toBe(false);
  });

  test("is on only for an explicit 'true' (case-insensitive) or '1'", () => {
    expect(isDemoMode({ DEMO_MODE: "true" })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: "TRUE" })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: "1" })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: "false" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "yes please" })).toBe(false);
  });
});
