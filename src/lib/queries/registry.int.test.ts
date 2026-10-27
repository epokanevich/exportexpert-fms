import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { buildBic } from "@/lib/iso6346";
import { searchRegistry, searchRegistryAll } from "./registry";
import { DEFAULT_REGISTRY_QUERY, REGISTRY_PAGE_SIZE, type RegistryQuery } from "./registry-params";
import { createContainer, resetDomain } from "../../../test/fixtures";

const TODAY = new Date("2026-10-27T00:00:00.000Z");
const q = (over: Partial<RegistryQuery>): RegistryQuery => ({ ...DEFAULT_REGISTRY_QUERY, ...over });

beforeAll(async () => {
  await resetDomain(prisma);
  // 120 единиц: 3 страницы, разные статусы/локации; одна списанная; одна с КБК на исходе.
  for (let i = 0; i < 120; i++) {
    await createContainer(prisma, {
      bicCode: buildBic(i % 2 ? "TSTU" : "EXPU", String(400000 + i)),
      operationalStatus: i % 3 === 0 ? "IN_TRANSIT" : "AVAILABLE",
      currentLocode: i % 4 === 0 ? "RUMOW" : "RUVVO",
      totalRevenueUsd: String(i * 10),
    });
  }
  const off = await createContainer(prisma, { bicCode: buildBic("EXPU", "999999") });
  await prisma.container.update({ where: { id: off.id }, data: { operationalStatus: "WRITTEN_OFF", deletedAt: new Date() } });
  await createContainer(prisma, { bicCode: buildBic("EXPU", "888888"), cscPlateExpiry: new Date("2026-11-05T00:00:00.000Z"), operationalStatus: "IN_TRANSIT" });
});
afterAll(() => prisma.$disconnect());

describe("server-side registry search (4.4)", () => {
  test("pages of 50, total and fleet size exclude written-off units", async () => {
    const page1 = await searchRegistry(q({}), TODAY);
    expect(page1.rows).toHaveLength(REGISTRY_PAGE_SIZE);
    expect(page1.total).toBe(121);
    expect(page1.pageCount).toBe(3);
    expect(page1.fleet.units).toBe(121);
    const page3 = await searchRegistry(q({ page: 3 }), TODAY);
    expect(page3.rows).toHaveLength(21);
    expect(page1.rows.map((r) => r.bicCode)).toEqual([...page1.rows.map((r) => r.bicCode)].sort());
  });

  test("substring search on the BIC number", async () => {
    const r = await searchRegistry(q({ q: "40011" }), TODAY);
    expect(r.rows.map((x) => x.bicCode).every((b) => b.includes("40011"))).toBe(true);
    expect(r.total).toBe(10); // 400110 … 400119
  });

  test("filters combine on the server", async () => {
    const r = await searchRegistry(q({ status: "IN_TRANSIT", locode: "RUMOW" }), TODAY);
    expect(r.total).toBe(10); // i кратно 12
    expect(r.rows.every((x) => x.operationalStatus === "IN_TRANSIT" && x.currentLocode === "RUMOW")).toBe(true);
  });

  test("«Требуют внимания» uses the same rule as the dashboard (CSC within 30 days)", async () => {
    const r = await searchRegistry(q({ attention: true }), TODAY);
    expect(r.rows.map((x) => x.bicCode)).toEqual([buildBic("EXPU", "888888")]);
    expect(r.rows[0].needsAttention).toBe(true);
  });

  test("written-off units appear only under the «Списанные» filter", async () => {
    const r = await searchRegistry(q({ status: "WRITTEN_OFF" }), TODAY);
    expect(r.rows.map((x) => x.bicCode)).toEqual([buildBic("EXPU", "999999")]);
    expect((await searchRegistry(q({ q: "999999" }), TODAY)).total).toBe(0);
  });

  test("sorting by ROI is done over the whole result set", async () => {
    const r = await searchRegistry(q({ sort: "roi", dir: "desc" }), TODAY);
    const rois = r.rows.map((x) => x.roi);
    expect(rois).toEqual([...rois].sort((a, b) => b - a));
    expect(r.rows[0].totalRevenueUsd).toBe(1190);
  });

  test("the trigram GIN index exists for the substring search", async () => {
    const idx = await prisma.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE indexname = 'Container_bicCode_trgm_idx'`;
    expect(idx[0]?.indexdef).toContain("gin_trgm_ops");
  });

  test("CSV export returns the whole filtered selection in the current order, not one page", async () => {
    const all = await searchRegistryAll(q({ locode: "RUVVO", sort: "bicCode", dir: "desc" }), TODAY);
    expect(all.length).toBeGreaterThan(REGISTRY_PAGE_SIZE);
    expect(all.every((r) => r.currentLocode === "RUVVO")).toBe(true);
    expect(all.map((r) => r.bicCode)).toEqual([...all.map((r) => r.bicCode)].sort().reverse());
  });

  test("every sort key works on the server", async () => {
    for (const sort of ["sizeType", "operationalStatus", "currentLocode", "csc", "idle"] as const) {
      const r = await searchRegistry(q({ sort, dir: "desc" }), TODAY);
      expect(r.rows).toHaveLength(REGISTRY_PAGE_SIZE);
    }
    expect((await searchRegistry(q({ size: "40HC", grade: "CW", tech: "SOUND" }), TODAY)).total).toBe(121);
  });
});
