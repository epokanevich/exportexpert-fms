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

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
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
