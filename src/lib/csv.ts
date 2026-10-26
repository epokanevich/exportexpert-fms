/**
 * CSV для русскоязычного Excel: UTF-8 с BOM (иначе кириллица превращается в «кракозябры»),
 * разделитель «;» (запятая — десятичный разделитель в ru-RU), переводы строк CRLF.
 */
import { formatDate } from "./format";

export const CSV_BOM = String.fromCharCode(0xfeff); // UTF-8 BOM, U+FEFF
const DELIMITER = ";";
const LINE_BREAK = "\r\n";
/** Символы, с которых Excel начинает формулу — защита от CSV/формула-инъекций. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[";\r\n]/;
/** Телефон вида «+7 812 336-50-20»: только безопасные символы — можно отдать как текстовую константу Excel. */
const PHONE_LIKE = /^\+[\d\s()-]+$/;

export type CsvCell = string | number | boolean | Date | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvCell;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return text.replace(".", ",");
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeText(value: string): string {
  // ="+7 …" Excel показывает как обычный текст, без апострофа; шаблон PHONE_LIKE исключает инъекцию.
  if (PHONE_LIKE.test(value)) return quote(`="${value}"`);
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? quote(safe) : safe;
}

export function formatCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (value instanceof Date) return formatDate(value);
  return escapeText(value);
}

export function buildCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeText(c.header)).join(DELIMITER);
  const lines = rows.map((row) => columns.map((c) => formatCsvCell(c.value(row))).join(DELIMITER));
  return CSV_BOM + [header, ...lines].join(LINE_BREAK);
}

/** Имя файла с датой выгрузки: fms-registry_2026-10-26.csv */
export function csvFilename(prefix: string, now: Date = new Date()): string {
  return `${prefix}_${now.toISOString().slice(0, 10)}.csv`;
}

/** Скачивание в браузере (только клиентский код). */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Даём браузеру начать загрузку, затем освобождаем память.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
