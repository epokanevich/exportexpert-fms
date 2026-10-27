import { describe, expect, test } from "vitest";
import { DEFAULT_REGISTRY_QUERY, parseRegistryQuery, registryQueryString } from "./registry-params";

describe("registry URL params (4.4)", () => {
  test("the number search ignores spaces, dashes and case", () => {
    expect(parseRegistryQuery({ q: "expu 402918-4" }).q).toBe("EXPU4029184");
    expect(parseRegistryQuery(new URLSearchParams("q=29%2018")).q).toBe("2918");
  });

  test("unknown filter values, SQL fragments and bad pages are dropped", () => {
    const q = parseRegistryQuery({ status: "LOST", size: "99XX", locode: "RU'; DROP", sort: "password", dir: "sideways", page: "-3", q: "'; DROP TABLE x;--" });
    expect(q).toEqual({ ...DEFAULT_REGISTRY_QUERY, q: "DROPTABLEX" });
  });

  test("valid filters survive the round trip", () => {
    const parsed = parseRegistryQuery({ status: "AVAILABLE", locode: "RUVVO", attention: "1", sort: "roi", dir: "desc", page: "3" });
    expect(parsed).toMatchObject({ status: "AVAILABLE", locode: "RUVVO", attention: true, sort: "roi", dir: "desc", page: 3 });
    expect(registryQueryString(parsed)).toBe("?locode=RUVVO&status=AVAILABLE&attention=1&sort=roi&dir=desc&page=3");
    expect(registryQueryString({})).toBe("");
  });

  test("the written-off filter is a regular status value", () => {
    expect(parseRegistryQuery({ status: "WRITTEN_OFF" }).status).toBe("WRITTEN_OFF");
  });
});
