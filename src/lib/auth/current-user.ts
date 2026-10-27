import "server-only";
import { prisma } from "@/lib/prisma";
import { getSession } from "./dal";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Пользователь по действующей сессии: JWT проверен, учётная запись существует, роль — из БД.
 * null — нет сессии, пользователь удалён или сессия отозвана.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, email: true, name: true, role: true } });
  return user;
}
