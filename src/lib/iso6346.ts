/**
 * ISO 6346 — идентификация грузовых контейнеров.
 * Формат: 3 буквы кода владельца + 1 буква идентификатора категории (U/J/Z)
 * + 6 цифр серийного номера + 1 контрольная цифра. Пример: TKRU 204812-?
 */

// Буквы кодируются числами 10..38, пропуская кратные 11 (11, 22, 33).
const LETTER_VALUES: Readonly<Record<string, number>> = (() => {
  const values: Record<string, number> = {};
  let value = 10;
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (value % 11 === 0) value += 1;
    values[letter] = value;
    value += 1;
  }
  return values;
})();

const STANDARD_CATEGORY_IDS = ["U", "J", "Z"] as const;
const BIC_PATTERN = /^([A-Z]{4})(\d{6})(\d)?$/;

/** Убирает пробелы, дефисы и приводит к верхнему регистру: "exex 402918-3" → "EXEX4029183". */
export function normalizeBic(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Контрольная цифра для первых 10 символов (4 буквы + 6 цифр). */
export function computeCheckDigit(first10: string): number {
  const code = normalizeBic(first10);
  if (!/^[A-Z]{4}\d{6}$/.test(code)) {
    throw new Error(`Ожидается 4 буквы и 6 цифр, получено: "${first10}"`);
  }
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = code[i];
    const charValue = i < 4 ? LETTER_VALUES[ch] : Number(ch);
    sum += charValue * 2 ** i;
  }
  return (sum % 11) % 10;
}

/** Собирает полный номер с контрольной цифрой: ("EXEX", "402918") → "EXEX4029183". */
export function buildBic(ownerPrefix: string, serial: string): string {
  const base = `${ownerPrefix.toUpperCase()}${serial}`;
  return `${base}${computeCheckDigit(base)}`;
}

export interface BicValidation {
  valid: boolean;
  normalized: string;
  expectedCheckDigit: number | null;
  errors: string[];
  warnings: string[];
}

export function validateBic(raw: string): BicValidation {
  const normalized = normalizeBic(raw);
  const result: BicValidation = { valid: false, normalized, expectedCheckDigit: null, errors: [], warnings: [] };
  const match = BIC_PATTERN.exec(normalized);

  if (!match) {
    result.errors.push("Формат: 4 буквы + 6 цифр + контрольная цифра (например, TKRU 204812-?)");
    return result;
  }

  const [, prefix, serial, checkDigit] = match;
  const expected = computeCheckDigit(prefix + serial);
  result.expectedCheckDigit = expected;

  if (checkDigit === undefined) {
    result.errors.push(`Не указана контрольная цифра. Ожидается: ${expected}`);
  } else if (Number(checkDigit) !== expected) {
    result.errors.push(`Неверная контрольная цифра: ${checkDigit}, ожидается ${expected}`);
  }

  if (!STANDARD_CATEGORY_IDS.includes(prefix[3] as (typeof STANDARD_CATEGORY_IDS)[number])) {
    result.warnings.push(
      `4-й символ «${prefix[3]}» не является стандартным идентификатором категории (U/J/Z)`,
    );
  }

  result.valid = result.errors.length === 0;
  return result;
}

/** Отображение: "EXEX4029183" → "EXEX 402918-3". */
export function formatBic(normalized: string): string {
  const code = normalizeBic(normalized);
  if (code.length !== 11) return code;
  return `${code.slice(0, 4)} ${code.slice(4, 10)}-${code.slice(10)}`;
}
