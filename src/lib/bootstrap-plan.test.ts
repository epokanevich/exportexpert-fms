import { describe, expect, test } from "vitest";
import { planBootstrap } from "./bootstrap-plan";

const empty = { users: 0, containers: 0 };

describe("bootstrap: only into an empty database (3.3, 6.1)", () => {
  test("a database with users or containers is never touched", () => {
    expect(planBootstrap({ users: 3, containers: 0 }, { DEMO_MODE: "true" })).toEqual({ kind: "skip", reason: "База уже заполнена (пользователей: 3, контейнеров: 0)" });
    expect(planBootstrap({ users: 0, containers: 31 }, {})).toMatchObject({ kind: "skip" });
  });

  test("demo mode seeds the demo fleet", () => {
    expect(planBootstrap(empty, { DEMO_MODE: "true" })).toEqual({ kind: "demo" });
  });

  test("production without demo mode creates only the admin from ADMIN_INITIAL_PASSWORD", () => {
    expect(planBootstrap(empty, { ADMIN_INITIAL_PASSWORD: "Strong-Pass-2026", ADMIN_EMAIL: "Ops@Company.ru" })).toEqual({
      kind: "admin",
      email: "ops@company.ru",
      name: "Администратор",
      password: "Strong-Pass-2026",
    });
  });

  test("without ADMIN_INITIAL_PASSWORD the first start fails with a clear message (no default password)", () => {
    expect(planBootstrap(empty, {})).toEqual({
      kind: "error",
      message: "Пустая база и DEMO_MODE выключен: задайте ADMIN_INITIAL_PASSWORD (≥ 10 символов) для первого администратора",
    });
  });

  test("a weak initial password is refused", () => {
    expect(planBootstrap(empty, { ADMIN_INITIAL_PASSWORD: "Export2026!" })).toMatchObject({ kind: "error" });
    expect(planBootstrap(empty, { ADMIN_INITIAL_PASSWORD: "short" })).toMatchObject({ kind: "error" });
  });
});
