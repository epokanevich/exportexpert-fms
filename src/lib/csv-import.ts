/**
 * Импорт парка из CSV/Excel («Сохранить как CSV»): разбор файла и перевод строк в данные формы контейнера.
 * Валидация бизнес-правил (ISO 6346, дубли, тара < брутто) — на сервере теми же схемами, что и форма «Добавить».
 */
import { buildCsv, type CsvColumn } from "./csv";
import { computeCheckDigit, formatBic } from "./iso6346";

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 1_000_000;

export type ImportRecord = Record<string, string>;
export interface ImportRow {
  /** Номер строки в файле (заголовок — 1). */
  line: number;
  input: ImportRecord;
}
export interface ImportIssue {
  line: number;
  message: string;
}

/** Разбор CSV: BOM, разделитель «;» или «,», кавычки, переводы строк внутри кавычек. Пустые строки пропускаются. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes(";") || !firstLine.includes(",") ? ";" : ",";
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.some((c) => c.trim() !== "")) table.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      endRow();
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) endRow();
  return table;
}

type Kind = "text" | "upper" | "date" | "money";
interface ImportColumn {
  header: string;
  field: string;
  kind: Kind;
  required: boolean;
  /** Значение по умолчанию, если колонки нет или ячейка пуста. */
  fallback?: string;
  example: string;
}

/** Номер для примера в шаблоне: контрольная цифра считается, а не зашита. */
const TEMPLATE_BIC = formatBic(`EXPU402918${computeCheckDigit("EXPU402918")}`);

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  { header: "Номер контейнера", field: "bicCode", kind: "text", required: true, example: TEMPLATE_BIC },
  { header: "Типоразмер", field: "sizeType", kind: "upper", required: true, example: "40HC" },
  { header: "ISO-код", field: "isoCode", kind: "upper", required: true, example: "45G1" },
  { header: "Год выпуска", field: "manufactureYear", kind: "text", required: true, example: "2021" },
  { header: "Изготовитель", field: "manufacturer", kind: "text", required: true, example: "CIMC" },
  { header: "Тара, кг", field: "tareWeightKg", kind: "text", required: true, example: "3800" },
  { header: "Брутто, кг", field: "maxGrossWeightKg", kind: "text", required: true, example: "32500" },
  { header: "КБК до", field: "cscPlateExpiry", kind: "date", required: true, example: "2028-12-31" },
  { header: "UN/LOCODE", field: "currentLocode", kind: "upper", required: true, example: "RUVVO" },
  { header: "Терминал / депо", field: "currentTerminal", kind: "text", required: true, example: "ВМТП" },
  { header: "Дата покупки", field: "purchaseDate", kind: "date", required: true, example: "2021-03-15" },
  { header: "Цена покупки, $", field: "purchasePriceUsd", kind: "money", required: true, example: "4300,00" },
  { header: "Цвет RAL", field: "colorRal", kind: "text", required: false, fallback: "н/д", example: "RAL 5013" },
  { header: "Грейд", field: "conditionGrade", kind: "upper", required: false, fallback: "IICL6", example: "IICL6" },
  { header: "Тех. статус", field: "techStatus", kind: "upper", required: false, fallback: "SOUND", example: "SOUND" },
  { header: "Статус", field: "operationalStatus", kind: "upper", required: false, fallback: "AVAILABLE", example: "AVAILABLE" },
  { header: "Номер CSC", field: "cscPlateNumber", kind: "text", required: false, example: "" },
  { header: "ACEP", field: "acepNumber", kind: "text", required: false, example: "" },
  { header: "Владение", field: "ownershipType", kind: "upper", required: false, fallback: "OWNED", example: "OWNED" },
  { header: "Собственник", field: "ownerName", kind: "text", required: false, fallback: "ООО «Экспортэксперт»", example: "" },
  { header: "Лизингодатель", field: "lessorName", kind: "text", required: false, example: "" },
  { header: "Остаточная стоимость, $", field: "currentBookValueUsd", kind: "money", required: false, example: "" },
  { header: "Ставка хранения, $/сут", field: "storageRatePerDayUsd", kind: "money", required: false, example: "" },
  { header: "Примечание", field: "notes", kind: "text", required: false, example: "" },
];

/** Поле формы → заголовок колонки: ошибки показываются пользователю по-русски, как в его файле. */
export const IMPORT_FIELD_LABELS: Record<string, string> = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.field, c.header]));

const normalizeHeader = (value: string) => value.replace(/^﻿/, "").trim().toLowerCase().replace(/\s+/g, " ");

/** «31.12.2028» и «2028-12-31» → «2028-12-31»; иначе null. */
function normalizeDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  return ru ? `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}` : null;
}

function normalizeMoney(value: string): string | null {
  const text = value.replace(/[\s $]/g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(text) ? text : null;
}

function normalizeCell(column: ImportColumn, raw: string): { value: string } | { error: string } {
  const value = raw.trim();
  if (value === "") return { value: column.fallback ?? "" };
  if (column.kind === "date") {
    const date = normalizeDate(value);
    return date ? { value: date } : { error: `${column.header}: дата «${value}» — ожидается ДД.ММ.ГГГГ или ГГГГ-ММ-ДД` };
  }
  if (column.kind === "money") {
    const money = normalizeMoney(value);
    return money ? { value: money } : { error: `${column.header}: «${value}» — ожидается число, например 4300,50` };
  }
  return { value: column.kind === "upper" ? value.toUpperCase() : value };
}

/** Сопоставляет заголовки и строки; структурные ошибки останавливают разбор, ошибки ячеек копятся по строкам. */
export function mapImportTable(table: string[][]): { rows: ImportRow[]; errors: ImportIssue[] } {
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: "Файл пуст" }] };
  const index = new Map<string, number>();
  table[0].forEach((h, i) => index.set(normalizeHeader(h), i));
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !index.has(normalizeHeader(c.header)));
  if (missing.length > 0) {
    return { rows: [], errors: [{ line: 1, message: `Нет обязательных колонок: ${missing.map((c) => c.header).join(", ")}` }] };
  }
  const dataRows = table.slice(1);
  if (dataRows.length === 0) return { rows: [], errors: [{ line: 2, message: "В файле нет строк с контейнерами" }] };
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return { rows: [], errors: [{ line: 1, message: `Слишком много строк: ${dataRows.length}. За один раз — не более ${MAX_IMPORT_ROWS}` }] };
  }

  const rows: ImportRow[] = [];
  const errors: ImportIssue[] = [];
  dataRows.forEach((cells, i) => {
    const line = i + 2;
    const input: ImportRecord = {};
    for (const column of IMPORT_COLUMNS) {
      const position = index.get(normalizeHeader(column.header));
      const result = normalizeCell(column, position === undefined ? "" : (cells[position] ?? ""));
      if ("error" in result) errors.push({ line, message: result.error });
      else if (result.value !== "") input[column.field] = result.value;
    }
    // Остаточная стоимость по умолчанию — цена покупки (новая единица ещё не амортизирована).
    if (input.currentBookValueUsd === undefined && input.purchasePriceUsd !== undefined) input.currentBookValueUsd = input.purchasePriceUsd;
    rows.push({ line, input });
  });
  return { rows, errors };
}

/** Шаблон: заголовки + одна строка-пример (удалите её перед загрузкой своих данных). */
export function buildImportTemplate(): string {
  const columns: CsvColumn<null>[] = IMPORT_COLUMNS.map((c) => ({ header: c.header, value: () => c.example }));
  return buildCsv([null], columns);
}
