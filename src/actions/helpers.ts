import "server-only";
import { z } from "zod";
import { parseDateInput } from "@/lib/dates";
import type { ActionResult } from "./types";

export type Parsed<T> = { ok: true; data: T } | { ok: false; result: ActionResult };

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
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : null;
  if (code === "P2002") return { ok: false, error: "Запись с таким номером уже существует" };
  console.error(`[action:${context}]`, error);
  return { ok: false, error: "Не удалось сохранить изменения. Повторите попытку или обратитесь к администратору." };
}

export function notFound(entity: string): ActionResult {
  return { ok: false, error: `${entity} не найден(а) — возможно, данные были сброшены` };
}
