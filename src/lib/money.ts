/**
 * Деньги. В БД — numeric(12,2) (Prisma Decimal), в домене — число долларов, полученное только через целые центы.
 * Единое правило округления: до цента, половина — от нуля (как ROUND() в PostgreSQL для numeric).
 */

/** Значение из БД (Prisma.Decimal), строка или число. */
export type MoneyLike = number | string | { toString(): string };

const CENTS_PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/;

/** Целые центы. Шум двоичной арифметики (8.100000000000001) отбрасывается через 15 значащих цифр. */
export function toCents(value: MoneyLike): number {
  const text = typeof value === "number" ? numberToPlainString(value) : value.toString().trim();
  const match = CENTS_PATTERN.exec(text);
  if (!match) throw new Error(`Некорректная денежная сумма: ${text}`);
  const [, minus, whole, fraction = ""] = match;
  const padded = `${fraction}000`;
  const cents = Number(whole) * 100 + Number(padded.slice(0, 2));
  const roundUp = Number(padded[2]) >= 5 ? 1 : 0;
  const magnitude = cents + roundUp;
  return minus && magnitude !== 0 ? -magnitude : magnitude;
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Некорректная денежная сумма: ${value}`);
  // toPrecision(15) убирает хвост двоичной погрешности; toFixed(10) — экспоненциальную запись.
  return Number(value.toPrecision(15)).toFixed(10);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Округление до цента — единственная функция округления денег в приложении. */
export function roundMoney(value: MoneyLike): number {
  return fromCents(toCents(value));
}

/** Ставка × количество (сутки, единицы) — точно, в центах. */
export function mulRate(rate: MoneyLike, quantity: number): number {
  if (!Number.isInteger(quantity)) throw new Error(`Количество должно быть целым: ${quantity}`);
  return fromCents(toCents(rate) * quantity);
}

export function sumMoney(values: readonly MoneyLike[]): number {
  return fromCents(values.reduce<number>((sum, v) => sum + toCents(v), 0));
}

/** Для записи в numeric(12,2): строка с двумя знаками, без потери точности при передаче в Prisma. */
export function toDbMoney(value: MoneyLike): string {
  const cents = toCents(value);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Decimal из БД → число долларов (значения numeric(12,2) представимы без потерь при обратном чтении). */
export function fromDbMoney(value: MoneyLike): number;
export function fromDbMoney(value: MoneyLike | null): number | null;
export function fromDbMoney(value: MoneyLike | null): number | null {
  return value === null ? null : roundMoney(value);
}
