"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { createSessionCookie, deleteSessionCookie, readSessionToken, requireSession } from "@/lib/auth/dal";
import { clearLoginFailures, clientIp, consumeLoginAttempt } from "@/lib/auth/rate-limit";
import { BCRYPT_COST, MAX_PASSWORD_LENGTH, passwordProblem } from "@/lib/auth/password-policy";
import { parseInput, serverError } from "./helpers";
import type { ActionResult } from "./types";

export interface LoginState {
  error?: string;
  email?: string;
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Введите корректный email"),
  password: z.string().min(1, "Введите пароль").max(200, "Слишком длинный пароль"),
  next: z.string().optional(),
});

/** bcrypt-хэш случайной строки (cost 10) — для выравнивания времени ответа, если email не найден. */
const DUMMY_HASH = "$2b$10$HLDPiLxOdhyn89tcGRN3x./4cRxAuZfFAu9CwC9gP2YiKeVji2F1C";

const INTERNAL_ORIGIN = "http://fms.internal";

/**
 * Разрешаем редирект только на внутренние пути (защита от open redirect).
 * Разбираем как URL: браузер трактует "/\evil.com" как "//evil.com", поэтому префиксной проверки мало.
 */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.includes("\\")) return "/";
  try {
    const url = new URL(next, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN || url.pathname.startsWith("/login") || url.pathname.startsWith("/auth")) return "/";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте данные", email: String(formData.get("email") ?? "") };
  }

  const { email, password, next } = parsed.data;
  const ip = clientIp(await headers());

  let user;
  try {
    // D-09: лимит в PostgreSQL по ключу IP+email — общий для всех инстансов; владелец с другого IP не заперт.
    // Попытка засчитывается до проверки пароля (атомарно) — пачка параллельных запросов не обойдёт лимит.
    const allowed = await consumeLoginAttempt(ip, email);
    if (!allowed.allowed) {
      const minutes = Math.max(1, Math.ceil(allowed.retryAfterSec / 60));
      return { error: `Слишком много неудачных попыток входа. Повторите через ${minutes} мин.`, email };
    }
    user = await prisma.user.findUnique({ where: { email } });
  } catch (error) {
    console.error("[action:auth]", error);
    return { error: "Сервис временно недоступен. Повторите попытку через минуту.", email };
  }
  // Для несуществующего email тоже считаем bcrypt — время ответа не выдаёт, есть ли такая учётная запись.
  const isValid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !isValid) {
    return { error: "Неверный email или пароль", email };
  }

  await clearLoginFailures(ip, email).catch((error: unknown) => console.error("[action:auth] rate-limit", error));
  await audit(prisma, { actor: user, action: "AUTH_LOGIN", entityType: "User", entityId: user.id, summary: `Вход ${user.email}`, details: { ip } });
  await createSessionCookie({ userId: user.id, email: user.email, name: user.name, role: user.role, tokenVersion: user.tokenVersion });
  redirect(safeNext(next));
}

/**
 * Выход отзывает все сессии пользователя (D-10): tokenVersion++ делает недействительным и этот токен,
 * и его копии (украденный cookie, другой браузер).
 */
export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) {
    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({ where: { id: token.userId }, data: { tokenVersion: { increment: 1 } } });
        await audit(tx, { actor: user, action: "AUTH_LOGOUT", entityType: "User", entityId: user.id, summary: `Выход ${user.email}: сессии отозваны` });
      });
    } catch (error) {
      // Пользователь мог быть удалён — cookie всё равно удаляем.
      console.error("[action:auth] logout", error);
    }
  }
  await deleteSessionCookie();
  redirect("/login");
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите текущий пароль").max(200),
    newPassword: z.string().min(1, "Введите новый пароль").max(200),
    confirmPassword: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.newPassword !== v.confirmPassword) ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Пароли не совпадают" });
  });

/** Смена пароля (3.3): проверка текущего, политика ≥ 10 символов, bcrypt; остальные сессии отзываются. */
export async function changePasswordAction(input: z.input<typeof changePasswordSchema>): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = parseInput(changePasswordSchema, input);
  if (!parsed.ok) return parsed.result;
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { ok: false, error: "Учётная запись не найдена — войдите заново" };

  const ip = clientIp(await headers());
  const key = `password:${user.id}`;
  const allowed = await consumeLoginAttempt(ip, key);
  if (!allowed.allowed) return { ok: false, error: "Слишком много неверных попыток. Повторите позже." };
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { ok: false, error: "Текущий пароль указан неверно", fieldErrors: { currentPassword: "Неверный пароль" } };
  }
  const problem = passwordProblem(newPassword, { email: user.email, currentPassword });
  if (problem) return { ok: false, error: problem, fieldErrors: { newPassword: problem } };
  if (newPassword.length > MAX_PASSWORD_LENGTH) return { ok: false, error: "Слишком длинный пароль" };

  try {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, passwordChangedAt: new Date(), tokenVersion: { increment: 1 } },
      });
      await audit(tx, { actor: u, action: "USER_PASSWORD_CHANGE", entityType: "User", entityId: u.id, summary: `Пароль изменён, другие сессии ${u.email} отозваны` });
      return u;
    });
    await clearLoginFailures(ip, key);
    // Текущий браузер остаётся в системе с новым токеном; все прочие сессии отозваны инкрементом версии.
    await createSessionCookie({ userId: updated.id, email: updated.email, name: updated.name, role: updated.role, tokenVersion: updated.tokenVersion });
    return { ok: true, message: "Пароль изменён. Сеансы на других устройствах завершены." };
  } catch (error) {
    return serverError("auth", error);
  }
}
