import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession, type SessionPayload } from "./session";

/** Куда отправлять при недействительной сессии: маршрут удаляет cookie и ведёт на /login (без цикла через proxy). */
export const SIGNOUT_PATH = "/auth/signout";

/**
 * Действующая сессия: подпись и срок JWT + пользователь существует и его tokenVersion совпадает с токеном (D-10).
 * Имя и роль — из БД, а не из токена. Кэшируется на один запрос.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const store = await cookies();
  const token = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!token) return null;
  const user = await prisma.user.findUnique({
    where: { id: token.userId },
    select: { id: true, email: true, name: true, role: true, tokenVersion: true },
  });
  if (!user || user.tokenVersion !== token.tokenVersion) return null;
  return { userId: user.id, email: user.email, name: user.name, role: user.role, tokenVersion: user.tokenVersion };
});

/** Для страниц и Server Actions: без действующей сессии — выход и /login. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect(SIGNOUT_PATH);
  return session;
}

/** Подпись токена без проверки по БД — только чтобы узнать, чью сессию отзывать при выходе. */
export async function readSessionToken(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function createSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function deleteSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
