import { describe, expect, test } from "vitest";
import { CSV_BOM, buildCsv, formatCsvCell, type CsvColumn } from "./csv";

interface Row {
  code: string;
  amount: number;
  date: Date | null;
  flag: boolean;
}

const columns: CsvColumn<Row>[] = [
  { header: "Номер", value: (r) => r.code },
  { header: "Сумма, $", value: (r) => r.amount },
  { header: "Дата", value: (r) => r.date },
  { header: "Флаг", value: (r) => r.flag },
];

describe("CSV for Russian Excel", () => {
  test("starts with UTF-8 BOM, uses ';' delimiter and CRLF line endings", () => {
    const csv = buildCsv([{ code: "EXEX 402918-4", amount: 105, date: null, flag: true }], columns);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.slice(1)).toBe("Номер;Сумма, $;Дата;Флаг\r\nEXEX 402918-4;105;;Да");
  });

  test("neutralises formula triggers incl. leading newline and full-width signs", () => {
    expect(formatCsvCell("\n=HYPERLINK(1)")).toBe(`"'\n=HYPERLINK(1)"`);
    expect(formatCsvCell("＝1+1")).toBe("'＝1+1");
    expect(formatCsvCell("＋7")).toBe("'＋7");
  });

  test("formats decimals with a comma and dates as dd.mm.yyyy", () => {
    expect(formatCsvCell(2.5)).toBe("2,50");
    expect(formatCsvCell(1329.9)).toBe("1329,90");
    expect(formatCsvCell(new Date("2026-10-26T00:00:00.000Z"))).toBe("26.10.2026");
  });

  test("quotes values containing the delimiter, quotes or line breaks", () => {
    expect(formatCsvCell('ООО «Альфа»; склад "Север"')).toBe('"ООО «Альфа»; склад ""Север"""');
    expect(formatCsvCell("строка 1\nстрока 2")).toBe('"строка 1\nстрока 2"');
  });

  test("neutralises spreadsheet formula injection in text cells", () => {
    expect(formatCsvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(formatCsvCell("+1+cmd|calc!A0")).toBe("'+1+cmd|calc!A0");
    expect(formatCsvCell("-2+3")).toBe("'-2+3");
    expect(formatCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  test("exports phone numbers as clean Excel text without an apostrophe", () => {
    expect(formatCsvCell("+7 812 336-50-20")).toBe('"=""+7 812 336-50-20"""');
  });

  test("keeps negative numbers numeric", () => {
    expect(formatCsvCell(-120)).toBe("-120");
  });
});
