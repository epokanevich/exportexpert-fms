import { describe, expect, test } from "vitest";
import { describeDbError } from "./db-errors";

const unique = (modelName: string, target: string[] | string) => ({ code: "P2002", meta: { modelName, target } });
const pg = (code: string, message: string) => ({ message: `ConnectorError(PostgresError { code: "${code}", message: "${message}" })` });

describe("describeDbError", () => {
  test("partial unique indexes → one active operation per container", () => {
    expect(describeDbError(unique("OneWayTrip", ["containerId"]))).toMatch(/активном рейсе One-Way/);
    expect(describeDbError(unique("LeaseContract", ["containerId"]))).toMatch(/действующем договоре аренды/);
    expect(describeDbError(unique("LeaseItem", "containerId"))).toMatch(/действующем договоре аренды/);
  });

  test("business keys", () => {
    expect(describeDbError(unique("Container", ["bicCode"]))).toMatch(/таким номером уже есть в реестре/);
    expect(describeDbError(unique("LeaseContract", ["contractNumber"]))).toBe("Договор с таким номером уже существует");
    expect(describeDbError(unique("User", ["email"]))).toMatch(/email/);
    expect(describeDbError(unique("X", []))).toBe("Запись с таким номером уже существует");
  });

  test("CHECK violations get a Russian label", () => {
    expect(describeDbError(pg("23514", 'new row for relation \\"Container\\" violates check constraint \\"Container_money_nonnegative_check\\"'))).toBe(
      "Данные не прошли проверку базы данных: денежная сумма не может быть отрицательной",
    );
    expect(describeDbError(pg("23514", "violates check constraint"))).toBe("Данные не прошли проверку базы данных");
  });

  test("RESTRICT / FK violations", () => {
    expect(describeDbError(pg("23001", "violates RESTRICT setting of foreign key constraint"))).toMatch(/не может быть удалена/);
    expect(describeDbError({ code: "P2003" })).toMatch(/не может быть удалена/);
  });

  test("unknown errors are not masked", () => {
    expect(describeDbError(new Error("connection reset"))).toBeNull();
    expect(describeDbError(null)).toBeNull();
    expect(describeDbError("boom")).toBeNull();
  });
});
