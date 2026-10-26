"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSessionCookie, deleteSessionCookie } from "@/lib/auth/dal";

export interface LoginState {
  error?: string;
  email?: string;
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Введите корректный email"),
  password: z.string().min(1, "Введите пароль").max(200),
  next: z.string().optional(),
});

// Простейший ограничитель перебора паролей (в памяти процесса; для кластера — Redis).
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function registerFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  attempts.set(key, entry && entry.resetAt > now ? { ...entry, count: entry.count + 1 } : { count: 1, resetAt: now + WINDOW_MS });
}

const INTERNAL_ORIGIN = "http://fms.internal";

/**
 * Разрешаем редирект только на внутренние пути (защита от open redirect).
 * Разбираем как URL: браузер трактует "/\evil.com" как "//evil.com", поэтому префиксной проверки мало.
 */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.includes("\\")) return "/";
  try {
    const url = new URL(next, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN || url.pathname.startsWith("/login")) return "/";
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
  if (isRateLimited(email)) {
    return { error: "Слишком много попыток входа. Повторите через 5 минут.", email };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const isValid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !isValid) {
    registerFailure(email);
    return { error: "Неверный email или пароль", email };
  }

  attempts.delete(email);
  await createSessionCookie({ userId: user.id, email: user.email, name: user.name, role: user.role });
  redirect(safeNext(next));
}

export async function logoutAction(): Promise<void> {
  await deleteSessionCookie();
  redirect("/login");
}
