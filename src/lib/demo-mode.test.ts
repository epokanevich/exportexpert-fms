import { describe, expect, test } from "vitest";
import { isDemoMode } from "./demo-mode";

describe("DEMO_MODE flag", () => {
  test("is on when the variable is missing — the review stand works out of the box", () => {
    expect(isDemoMode({})).toBe(true);
  });

  test("is off only for the exact value 'false'", () => {
    expect(isDemoMode({ DEMO_MODE: "false" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "true" })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: "" })).toBe(true);
  });
});
