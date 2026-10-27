import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/dal";
import type { SessionPayload } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/auth/permissions";
import { parseDateInput } from "@/lib/dates";
import { describeDbError } from "@/lib/db-errors";
import type { ActionResult } from "./types";

export type Parsed<T> = { ok: true; data: T } | { ok: false; result: ActionResult };

export type Authorized = { ok: true; session: SessionPayload } | { ok: false; result: ActionResult };

/**
 * Сессия + право на действие. Роль читается из БД, а не из JWT: понижение роли или удаление
 * пользователя действует сразу, не дожидаясь истечения 8-часового токена.
 */
export async function authorize(permission: Permission): Promise<Authorized> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, name: true } });
  if (!user) return { ok: false, result: { ok: false, error: "Учётная запись не найдена — войдите заново" } };
  if (!can(user.role, permission)) return { ok: false, result: { ok: false, error: "Недостаточно прав для этого действия" } };
  return { ok: true, session: { ...session, role: user.role, name: user.name } };
}

/** Состояние записи изменил параллельный запрос (двойной клик, второй сотрудник) — операция не выполнена. */
export class ConflictError extends Error {}

export function parseInput<S extends z.ZodType>(schema: S, input: unknown): Parsed<z.infer<S>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, result: { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте данные формы", fieldErrors } };
}

/** "2026-10-26" → Date (полночь UTC). */
export const dateField = z
  .string({ error: "Укажите дату" })
  .refine((v) => parseDateInput(v) !== null, "Некорректная дата")
  .transform((v) => parseDateInput(v) as Date);

export const moneyField = z.coerce.number({ error: "Введите число" }).min(0, "Не может быть отрицательным").max(10_000_000, "Слишком большое значение");

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Не более ${max} символов`)
    .optional()
    .transform((v) => (v ? v : null));

export const requiredText = (label: string, max = 200) => z.string({ error: `Укажите: ${label}` }).trim().min(1, `Укажите: ${label}`).max(max);

export const locodeField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}[A-Z2-9]{3}$/, "UN/LOCODE: 5 символов, например RUVVO");

export const innField = z
  .string()
  .trim()
  .regex(/^(\d{10}|\d{12})?$/, "ИНН: 10 или 12 цифр")
  .optional()
  .transform((v) => (v ? v : null));

/**
 * Неожиданная ошибка: подробности — только в серверный лог, пользователю — общий текст.
 * Нарушение уникальности (гонка двух одновременных запросов) переводится в понятное сообщение.
 */
export function serverError(context: string, error: unknown): ActionResult {
  if (error instanceof ConflictError) return { ok: false, error: error.message };
  // Нарушение уникальности/CHECK/RESTRICT — ожидаемая ситуация (гонка, двойной клик): понятный текст вместо 500.
  const known = describeDbError(error);
  if (known) return { ok: false, error: known };
  console.error(`[action:${context}]`, error);
  return { ok: false, error: "Не удалось сохранить изменения. Повторите попытку или обратитесь к администратору." };
}

export function notFound(entity: string): ActionResult {
  return { ok: false, error: `${entity} не найден(а) — возможно, данные были сброшены` };
}
