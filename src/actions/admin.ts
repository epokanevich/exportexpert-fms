"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ROLES, ROLE_LABELS } from "@/lib/auth/permissions";
import { BCRYPT_COST, passwordProblem } from "@/lib/auth/password-policy";
import { actorOf, authorize, ConflictError, notFound, parseInput, requiredText, serverError } from "./helpers";
import type { ActionResult } from "./types";

const roleSchema = z.object({ role: z.enum(ROLES, { error: "Выберите роль" }) });

/** Смена роли (ADMIN). Все сессии пользователя отзываются (D-10): новая роль действует с повторного входа. */
export async function changeUserRoleAction(userId: string, input: z.input<typeof roleSchema>): Promise<ActionResult> {
  const auth = await authorize("users:manage");
  if (!auth.ok) return auth.result;
  const parsed = parseInput(roleSchema, input);
  if (!parsed.ok) return parsed.result;
  const { role } = parsed.data;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } });
  if (!target) return notFound("Пользователь");
  if (target.role === role) return { ok: true, message: "Роль не изменилась" };
  if (target.id === auth.session.userId) return { ok: false, error: "Нельзя изменить собственную роль — попросите другого администратора" };

  try {
    await prisma.$transaction(async (tx) => {
      if (target.role === "ADMIN") {
        const admins = await tx.user.count({ where: { role: "ADMIN" } });
        if (admins <= 1) throw new ConflictError("Нельзя понизить последнего администратора");
      }
      const updated = await tx.user.updateMany({ where: { id: userId, role: target.role }, data: { role, tokenVersion: { increment: 1 } } });
      if (updated.count === 0) throw new ConflictError("Роль уже изменил другой администратор — обновите страницу");
      await audit(tx, {
        actor: actorOf(auth.session),
        action: "USER_ROLE_CHANGE",
        entityType: "User",
        entityId: userId,
        summary: `${target.email}: ${ROLE_LABELS[target.role] ?? target.role} → ${ROLE_LABELS[role]}; сессии отозваны`,
        details: { from: target.role, to: role },
      });
    });
  } catch (error) {
    return serverError("admin", error);
  }
  revalidatePath("/admin");
  return { ok: true, message: `${target.email}: роль «${ROLE_LABELS[role]}». Пользователь войдёт заново.` };
}

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Введите корректный email"),
  name: requiredText("имя", 120),
  role: z.enum(ROLES, { error: "Выберите роль" }),
  password: z.string().min(1, "Задайте временный пароль").max(200),
});

export async function createUserAction(input: z.input<typeof createUserSchema>): Promise<ActionResult> {
  const auth = await authorize("users:manage");
  if (!auth.ok) return auth.result;
  const parsed = parseInput(createUserSchema, input);
  if (!parsed.ok) return parsed.result;
  const data = parsed.data;
  const problem = passwordProblem(data.password, { email: data.email });
  if (problem) return { ok: false, error: problem, fieldErrors: { password: problem } };

  try {
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email: data.email, name: data.name, role: data.role, passwordHash } });
      await audit(tx, {
        actor: actorOf(auth.session),
        action: "USER_CREATE",
        entityType: "User",
        entityId: created.id,
        summary: `Создан пользователь ${created.email} (${ROLE_LABELS[created.role]})`,
      });
      return created;
    });
    revalidatePath("/admin");
    return { ok: true, message: `Пользователь ${user.email} создан. Передайте временный пароль лично и попросите сменить его.`, id: user.id };
  } catch (error) {
    return serverError("admin", error);
  }
}
