/**
 * Работа с датами на уровне суток (UTC). Даты-«дни» хранятся как полночь UTC,
 * поэтому разница в днях не зависит от часового пояса сервера.
 */

export const DAY_MS = 86_400_000;

export function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** +N месяцев; 31.01 + 1 мес. = 28.02 (29.02), а не 03.03 — день ограничивается длиной целевого месяца. */
export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getTime());
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  target.setUTCDate(Math.min(date.getUTCDate(), daysInMonthUtc(target)));
  return target;
}

/** Восточный край работы компании — Владивосток (UTC+10). */
const EASTERNMOST_UTC_OFFSET_HOURS = 10;

/**
 * Последняя календарная дата, которая уже наступила хотя бы у одного пользователя.
 * Сервер работает в UTC: без этого во Владивостоке до 10:00 «сегодня» отклонялось бы как дата в будущем.
 */
export function latestBusinessDate(now: Date): Date {
  return startOfDayUtc(new Date(now.getTime() + EASTERNMOST_UTC_OFFSET_HOURS * 3_600_000));
}

/** Сегодняшняя дата по часам пользователя → "2026-10-27" для <input type="date"> (только клиентский код). */
export function toLocalDateInput(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Количество полных суток от `from` до `to` (отрицательное, если `to` раньше). */
export function diffDays(from: Date, to: Date): number {
  return Math.round((startOfDayUtc(to).getTime() - startOfDayUtc(from).getTime()) / DAY_MS);
}

export function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function daysInMonthUtc(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

/** "2026-10-26" → полночь UTC. Возвращает null для невалидной строки. */
export function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Дата → "2026-10-26" для <input type="date">. */
export function toDateInput(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}
