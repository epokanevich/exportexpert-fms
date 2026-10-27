/**
 * Бизнес-время (D-28). Даты-«дни» в БД — полночь UTC календарной даты; «сегодня» для расчётов
 * (просрочка One-Way, начисления, дата дашборда) берётся по часовому поясу компании, а не сервера.
 * Пояс задаётся переменной BUSINESS_TIMEZONE (IANA, по умолчанию Europe/Moscow) — единственная настройка.
 */

export const DEFAULT_BUSINESS_TIMEZONE = "Europe/Moscow";

/** Восточный край работы компании: операция, датированная «сегодня» во Владивостоке, не считается будущей (D-06). */
export const EASTERNMOST_TIMEZONE = "Asia/Vladivostok";

export function resolveTimeZone(value: string | undefined): string {
  if (!value) return DEFAULT_BUSINESS_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    console.error(`[business-time] Неизвестный часовой пояс BUSINESS_TIMEZONE="${value}", используется ${DEFAULT_BUSINESS_TIMEZONE}`);
    return DEFAULT_BUSINESS_TIMEZONE;
  }
}

export function businessTimeZone(): string {
  return resolveTimeZone(process.env.BUSINESS_TIMEZONE);
}

/** Календарная дата момента `at` в поясе `timeZone` → полночь UTC этой даты. */
export function calendarDateIn(timeZone: string, at: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

/** «Сегодня» компании: полночь UTC календарной даты в бизнес-поясе. Передаётся в доменные расчёты как `now`. */
export function businessToday(at: Date = new Date(), timeZone: string = businessTimeZone()): Date {
  return calendarDateIn(timeZone, at);
}

/** Самая поздняя дата операции, которая уже наступила хотя бы у одного подразделения компании. */
export function latestBusinessDate(at: Date = new Date(), timeZone: string = businessTimeZone()): Date {
  const business = calendarDateIn(timeZone, at);
  const eastern = calendarDateIn(EASTERNMOST_TIMEZONE, at);
  return eastern > business ? eastern : business;
}
