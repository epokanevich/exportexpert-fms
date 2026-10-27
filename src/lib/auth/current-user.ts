import "server-only";
import { getSession } from "./dal";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/** Пользователь действующей сессии (JWT + tokenVersion + запись в БД) или null — для route handlers (401 вместо редиректа). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  return session ? { id: session.userId, email: session.email, name: session.name, role: session.role } : null;
}
