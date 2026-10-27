import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { LOGIN_LIMITS, checkLoginAllowed, clearLoginFailures, registerLoginFailure } from "@/lib/auth/rate-limit";
import { createUser, resetDomain } from "../../test/fixtures";

beforeEach(() => resetDomain(prisma));
afterAll(() => prisma.$disconnect());

describe("3.7 AuditLog is written in the same transaction as the mutation", () => {
  test("committed together", async () => {
    const user = await createUser(prisma, "MANAGER");
    await prisma.$transaction(async (tx) => {
      await audit(tx, { actor: user, action: "CONTAINER_UPDATE", entityType: "Container", entityId: "c1", summary: "Карточка обновлена" });
    });
    const rows = await prisma.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: user.id, actorName: user.name, action: "CONTAINER_UPDATE", entityId: "c1" });
  });

  test("rolled back together when the operation fails", async () => {
    const user = await createUser(prisma, "MANAGER");
    await expect(
      prisma.$transaction(async (tx) => {
        await audit(tx, { actor: user, action: "ONE_WAY_ISSUE", entityType: "OneWayTrip", entityId: "t1", summary: "Выдача" });
        throw new Error("операция не прошла");
      }),
    ).rejects.toThrow("операция не прошла");
    expect(await prisma.auditLog.count()).toBe(0);
  });
});

describe("3.2 login rate limit in PostgreSQL (D-09)", () => {
  const T0 = new Date("2026-10-27T09:00:00.000Z");

  test(`${LOGIN_LIMITS.perIpEmail.max} failures from one IP lock that IP + email only`, async () => {
    for (let i = 0; i < LOGIN_LIMITS.perIpEmail.max; i++) await registerLoginFailure("10.0.0.1", "admin@fms.ru", T0);

    expect(await checkLoginAllowed("10.0.0.1", "admin@fms.ru", T0)).toMatchObject({ allowed: false });
    // Владелец с другого IP с верным паролем не заперт.
    expect(await checkLoginAllowed("192.168.5.7", "admin@fms.ru", T0)).toEqual({ allowed: true });
    // Атакующий IP может войти под другим email (лимит на IP — выше).
    expect(await checkLoginAllowed("10.0.0.1", "manager@fms.ru", T0)).toEqual({ allowed: true });
  });

  test("the lock expires after the window", async () => {
    for (let i = 0; i < LOGIN_LIMITS.perIpEmail.max; i++) await registerLoginFailure("10.0.0.2", "a@fms.ru", T0);
    const later = new Date(T0.getTime() + LOGIN_LIMITS.perIpEmail.windowMs + 1000);
    expect(await checkLoginAllowed("10.0.0.2", "a@fms.ru", later)).toEqual({ allowed: true });
    await registerLoginFailure("10.0.0.2", "a@fms.ru", later);
    const row = await prisma.loginAttempt.findUniqueOrThrow({ where: { key: "10.0.0.2|a@fms.ru" } });
    expect(row.count).toBe(1); // окно началось заново
  });

  test("password spraying from one IP across many emails hits the per-IP limit", async () => {
    for (let i = 0; i < LOGIN_LIMITS.perIp.max; i++) await registerLoginFailure("10.0.0.3", `user${i}@fms.ru`, T0);
    expect(await checkLoginAllowed("10.0.0.3", "fresh@fms.ru", T0)).toMatchObject({ allowed: false });
  });

  test("parallel failures are counted atomically (shared by all app instances)", async () => {
    await Promise.all(Array.from({ length: 20 }, () => registerLoginFailure("10.0.0.4", "b@fms.ru", T0)));
    const row = await prisma.loginAttempt.findUniqueOrThrow({ where: { key: "10.0.0.4|b@fms.ru" } });
    expect(row.count).toBe(20);
  });

  test("a successful login clears the IP + email counter", async () => {
    await registerLoginFailure("10.0.0.5", "c@fms.ru", T0);
    await clearLoginFailures("10.0.0.5", "c@fms.ru");
    expect(await prisma.loginAttempt.findUnique({ where: { key: "10.0.0.5|c@fms.ru" } })).toBeNull();
  });
});
