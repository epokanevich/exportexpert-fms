/**
 * Форматирование без зависимости от ICU — одинаковый вывод на сервере и в браузере
 * (исключает рассинхрон гидрации из-за разных пробелов-разделителей).
 */

const THIN_SPACE = " ";

function groupThousands(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
}

export function formatNumber(value: number, fractionDigits = 0): string {
  const sign = value < 0 ? "−" : "";
  const [integer, fraction] = Math.abs(value).toFixed(fractionDigits).split(".");
  return `${sign}${groupThousands(integer)}${fraction ? `,${fraction}` : ""}`;
}

/** $1 234 или $2,50 — копейки показываются, только если они есть или явно запрошены. */
export function formatUsd(value: number, fractionDigits?: number): string {
  const digits = fractionDigits ?? (Number.isInteger(value) ? 0 : 2);
  const sign = value < 0 ? "−" : "";
  return `${sign}$${formatNumber(Math.abs(value), digits)}`;
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${formatNumber(value * 100, fractionDigits)}%`;
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Дата-«день» (полночь UTC): 26.10.2026 */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** Короткая дата: 26 окт 2026 */
export function formatDateShort(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const MOSCOW_OFFSET_MS = 3 * 3_600_000;

/** Дата и время события по Москве: 26.10.2026 14:30 */
export function formatDateTime(value: Date | string): string {
  const d = new Date(new Date(value).getTime() + MOSCOW_OFFSET_MS);
  return `${formatDate(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Склонение: plural(5, ["день", "дня", "дней"]) → "дней" */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function formatDays(n: number): string {
  return `${n} ${plural(n, ["день", "дня", "дней"])}`;
}
