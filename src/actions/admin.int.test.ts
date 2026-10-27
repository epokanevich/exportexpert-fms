import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", async () => {
  const { currentSession } = await import("../../test/session-mock");
  return { requireSession: vi.fn(async () => currentSession), getSession: vi.fn(async () => currentSession) };
});

import { prisma } from "@/lib/prisma";
import { changeUserRoleAction, createUserAction } from "./admin";
import { deleteContainerAction } from "./containers";
import { createContainer, createUser, resetDomain } from "../../test/fixtures";
import { actAsUser } from "../../test/session-mock";

beforeEach(() => resetDomain(prisma));
afterAll(() => prisma.$disconnect());

describe("3.1 / 3.7: role change revokes sessions and is audited", () => {
  test("ADMIN demotes a MANAGER: tokenVersion++, old token is refused, AuditLog row with the actor", async () => {
    const admin = await createUser(prisma, "ADMIN");
    const manager = await createUser(prisma, "MANAGER");
    actAsUser(admin);

    expect(await changeUserRoleAction(manager.id, { role: "INSPECTOR" })).toMatchObject({ ok: true });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: manager.id } });
    expect(after).toMatchObject({ role: "INSPECTOR", tokenVersion: 1 });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "USER_ROLE_CHANGE" } });
    expect(log).toMatchObject({ userId: admin.id, entityId: manager.id, details: { from: "MANAGER", to: "INSPECTOR" } });

    // Старый токен менеджера (tokenVersion 0) больше не работает в экшенах.
    actAsUser({ ...manager, tokenVersion: 0 });
    const c = await createContainer(prisma);
    expect(await deleteContainerAction(c.id, { reason: "проверка" })).toEqual({ ok: false, error: "Сессия завершена — войдите заново" });
  });

  test("the last ADMIN cannot be demoted, and nobody changes their own role", async () => {
    const admin = await createUser(prisma, "ADMIN");
    const other = await createUser(prisma, "ADMIN");
    actAsUser(admin);
    expect(await changeUserRoleAction(admin.id, { role: "MANAGER" })).toMatchObject({ ok: false });
    expect(await changeUserRoleAction(other.id, { role: "MANAGER" })).toMatchObject({ ok: true });
    actAsUser({ ...admin });
    await prisma.user.update({ where: { id: other.id }, data: { role: "ADMIN" } });
    await prisma.user.update({ where: { id: admin.id }, data: { role: "MANAGER" } });
    actAsUser(await prisma.user.findUniqueOrThrow({ where: { id: other.id } }));
    expect(await changeUserRoleAction(other.id, { role: "INSPECTOR" })).toMatchObject({ ok: false });
  });

  test("MANAGER cannot manage users", async () => {
    actAsUser(await createUser(prisma, "MANAGER"));
    const result = await createUserAction({ email: "new@fms.ru", name: "Новый", role: "ADMIN", password: "Strong-Pass-2026" });
    expect(result).toMatchObject({ ok: false, error: "Недостаточно прав для этого действия" });
    expect(await prisma.user.count({ where: { email: "new@fms.ru" } })).toBe(0);
  });

  test("ADMIN creates a user with a policy-compliant password; duplicate email gets a readable error", async () => {
    actAsUser(await createUser(prisma, "ADMIN"));
    expect(await createUserAction({ email: "Insp@FMS.ru", name: "Инспектор", role: "INSPECTOR", password: "short" })).toMatchObject({ ok: false });
    expect(await createUserAction({ email: "Insp@FMS.ru", name: "Инспектор", role: "INSPECTOR", password: "Terminal-Gate-7" })).toMatchObject({ ok: true });
    expect(await createUserAction({ email: "insp@fms.ru", name: "Дубль", role: "INSPECTOR", password: "Terminal-Gate-7" })).toMatchObject({
      ok: false,
      error: "Пользователь с таким email уже существует",
    });
    expect(await prisma.auditLog.count({ where: { action: "USER_CREATE" } })).toBe(1);
  });
});
