import { describe, expect, it } from "vitest";
import { buildImportTemplate, mapImportTable, parseCsv, MAX_IMPORT_ROWS } from "./csv-import";

const HEADER = "Номер контейнера;Типоразмер;ISO-код;Год выпуска;Изготовитель;Тара, кг;Брутто, кг;КБК до;UN/LOCODE;Терминал / депо;Дата покупки;Цена покупки, $";

describe("parseCsv", () => {
  it("читает BOM, разделитель «;», кавычки и CRLF", () => {
    const table = parseCsv('\uFEFFa;b\r\n"x;1";"he said ""hi"""\r\n');
    expect(table).toEqual([["a", "b"], ["x;1", 'he said "hi"']]);
  });

  it("определяет запятую как разделитель, если «;» нет", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("пропускает пустые строки и переводы строк внутри кавычек сохраняет", () => {
    expect(parseCsv('a;b\n\n"1\n2";3\n')).toEqual([["a", "b"], ["1\n2", "3"]]);
  });
});

describe("mapImportTable", () => {
  it("переводит строку в данные формы: даты ДД.ММ.ГГГГ, деньги с запятой, значения по умолчанию", () => {
    const table = parseCsv(`${HEADER}\nEXPU 402918-4;40hc;45g1;2021;CIMC;3800;32500;31.12.2028;ruvvo;ВМТП;15.03.2021;4 300,50`);
    const { rows, errors } = mapImportTable(table);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe(2);
    expect(rows[0].input).toMatchObject({
      bicCode: "EXPU 402918-4",
      sizeType: "40HC",
      isoCode: "45G1",
      manufactureYear: "2021",
      cscPlateExpiry: "2028-12-31",
      purchaseDate: "2021-03-15",
      purchasePriceUsd: "4300.50",
      currentBookValueUsd: "4300.50",
      currentLocode: "RUVVO",
      conditionGrade: "IICL6",
      techStatus: "SOUND",
      operationalStatus: "AVAILABLE",
      ownershipType: "OWNED",
    });
  });

  it("сообщает об отсутствующих обязательных колонках", () => {
    const { rows, errors } = mapImportTable(parseCsv("Номер контейнера;Типоразмер\nEXPU4029184;40HC"));
    expect(rows).toEqual([]);
    expect(errors[0].line).toBe(1);
    expect(errors[0].message).toContain("ISO-код");
  });

  it("сообщает о неизвестной дате и пустом файле", () => {
    const bad = mapImportTable(parseCsv(`${HEADER}\nEXPU4029184;40HC;45G1;2021;CIMC;3800;32500;вчера;RUVVO;ВМТП;15.03.2021;4300`));
    expect(bad.errors[0]).toMatchObject({ line: 2 });
    expect(bad.errors[0].message).toContain("КБК");
    expect(mapImportTable([]).errors[0].message).toContain("пуст");
  });

  it("защищает от формул в тексте: ведущий апостроф не нужен, но значения сохраняются как текст", () => {
    const { rows } = mapImportTable(parseCsv(`${HEADER};Примечание\nEXPU4029184;40HC;45G1;2021;CIMC;3800;32500;2028-12-31;RUVVO;ВМТП;2021-03-15;4300;=1+1`));
    expect(rows[0].input.notes).toBe("=1+1");
  });

  it(`ограничивает число строк (${MAX_IMPORT_ROWS})`, () => {
    const lines = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => "EXPU4029184;40HC;45G1;2021;CIMC;3800;32500;2028-12-31;RUVVO;ВМТП;2021-03-15;4300");
    const { errors } = mapImportTable(parseCsv([HEADER, ...lines].join("\n")));
    expect(errors[0].message).toContain(String(MAX_IMPORT_ROWS));
  });
});

describe("buildImportTemplate", () => {
  it("содержит BOM, заголовки и пример, который проходит разбор без ошибок", () => {
    const text = buildImportTemplate();
    expect(text.startsWith("\uFEFF")).toBe(true);
    const { rows, errors } = mapImportTable(parseCsv(text));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });
});
