import { describe, expect, test } from "vitest";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "./password-policy";

describe("password policy (3.3)", () => {
  test("at least 10 characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(passwordProblem("Short1!", { email: "a@b.ru" })).toBe("Пароль — не короче 10 символов");
    expect(passwordProblem("Container-2026", { email: "a@b.ru" })).toBeNull();
  });

  test("not the e-mail, not the old password, not one repeated character", () => {
    expect(passwordProblem("admin@exportexpert.ru", { email: "admin@exportexpert.ru" })).toMatch(/email/);
    expect(passwordProblem("Export2026!x", { email: "a@b.ru", currentPassword: "Export2026!x" })).toMatch(/совпадает/);
    expect(passwordProblem("aaaaaaaaaaaa", { email: "a@b.ru" })).toMatch(/простой/);
  });

  test("known demo password is refused for real accounts", () => {
    expect(passwordProblem("Export2026!", { email: "a@b.ru" })).not.toBeNull();
  });

  test("an upper bound protects bcrypt from huge inputs", () => {
    expect(passwordProblem("x".repeat(73) + "Ab1", { email: "a@b.ru" })).toMatch(/не длиннее/);
  });
});
