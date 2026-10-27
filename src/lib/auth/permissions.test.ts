import { describe, expect, test } from "vitest";
import { can } from "./permissions";

describe("role permissions", () => {
  test("ADMIN can do everything, including demo reset and write-off", () => {
    expect(can("ADMIN", "demo:reset")).toBe(true);
    expect(can("ADMIN", "fleet:delete")).toBe(true);
    expect(can("ADMIN", "operations:manage")).toBe(true);
  });

  test("MANAGER runs operations but cannot write off containers or reset data", () => {
    expect(can("MANAGER", "operations:manage")).toBe(true);
    expect(can("MANAGER", "fleet:edit")).toBe(true);
    expect(can("MANAGER", "fleet:delete")).toBe(false);
    expect(can("MANAGER", "demo:reset")).toBe(false);
  });

  test("INSPECTOR may only inspect: no One-Way, leases, edits or write-off", () => {
    expect(can("INSPECTOR", "inspection")).toBe(true);
    expect(can("INSPECTOR", "operations:manage")).toBe(false);
    expect(can("INSPECTOR", "fleet:edit")).toBe(false);
    expect(can("INSPECTOR", "fleet:delete")).toBe(false);
  });

  test("only ADMIN manages users and reads the audit log", () => {
    expect(can("ADMIN", "users:manage")).toBe(true);
    expect(can("ADMIN", "audit:view")).toBe(true);
    expect(can("MANAGER", "users:manage")).toBe(false);
    expect(can("MANAGER", "audit:view")).toBe(false);
    expect(can("INSPECTOR", "audit:view")).toBe(false);
  });

  test("an unknown role gets no permissions", () => {
    expect(can("SUPERADMIN", "inspection")).toBe(false);
    expect(can("", "inspection")).toBe(false);
  });
});
