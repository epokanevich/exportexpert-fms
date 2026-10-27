import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays } from "@/lib/dates";
import { THRESHOLDS } from "@/lib/domain/constants";
import { rowInclude, toContainerRow, type ContainerRow } from "./containers";
import { REGISTRY_PAGE_SIZE, type RegistryQuery, type SortKey } from "./registry-params";

export interface RegistryPage {
  rows: ContainerRow[];
  total: number;
  /** Весь действующий парк (без списанных) — для подзаголовка. */
  fleet: { units: number; teu: number };
  page: number;
  pageCount: number;
}

/**
 * Выражения сортировки. ROI = (выручка − ремонты − амортизация) / цена — считается в SQL,
 * чтобы сортировать по всей выборке, а не по странице.
 */
const ORDER_BY: Record<SortKey, Prisma.Sql> = {
  bicCode: Prisma.sql`c."bicCode"`,
  sizeType: Prisma.sql`c."sizeType"`,
  operationalStatus: Prisma.sql`c."operationalStatus"`,
  currentLocode: Prisma.sql`c."currentLocode"`,
  csc: Prisma.sql`c."cscPlateExpiry"`,
  idle: Prisma.sql`c."storageStartDate" IS NULL, c."storageStartDate"`,
  roi: Prisma.sql`CASE WHEN c."purchasePriceUsd" > 0 THEN (c."totalRevenueUsd" - c."totalRepairCostUsd" - GREATEST(0, c."purchasePriceUsd" - c."currentBookValueUsd")) / c."purchasePriceUsd" ELSE 0 END`,
};

function whereOf(q: RegistryQuery, today: Date): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  // Списанные видны только в фильтре «Списанные» (1.3).
  parts.push(q.status === "WRITTEN_OFF" ? Prisma.sql`c."deletedAt" IS NOT NULL` : Prisma.sql`c."deletedAt" IS NULL`);
  // LIKE по подстроке использует GIN-индекс pg_trgm (Container_bicCode_trgm_idx). q уже только [A-Z0-9].
  if (q.q) parts.push(Prisma.sql`c."bicCode" LIKE ${`%${q.q}%`}`);
  if (q.locode) parts.push(Prisma.sql`c."currentLocode" = ${q.locode}`);
  if (q.size) parts.push(Prisma.sql`c."sizeType" = ${q.size}`);
  if (q.status && q.status !== "WRITTEN_OFF") parts.push(Prisma.sql`c."operationalStatus" = ${q.status}`);
  if (q.grade) parts.push(Prisma.sql`c."conditionGrade" = ${q.grade}`);
  if (q.tech) parts.push(Prisma.sql`c."techStatus" = ${q.tech}`);
  if (q.attention) {
    // Те же правила, что в domain/container.ts → attentionFlagsOf: КБК ≤ 30 дн., ремонт, простой > 30 дн.
    const cscLimit = addDays(today, THRESHOLDS.cscWarningDays).toISOString();
    const idleLimit = addDays(today, -THRESHOLDS.idleStockDays).toISOString();
    parts.push(Prisma.sql`(
      c."cscPlateExpiry" <= (${cscLimit}::timestamptz AT TIME ZONE 'UTC')
      OR c."techStatus" IN ('DAMAGED', 'IN_REPAIR')
      OR (c."operationalStatus" = 'AVAILABLE' AND c."storageStartDate" < (${idleLimit}::timestamptz AT TIME ZONE 'UTC'))
    )`);
  }
  return Prisma.join(parts, " AND ");
}

export async function searchRegistry(query: RegistryQuery, today: Date): Promise<RegistryPage> {
  const where = whereOf(query, today);
  const direction = query.dir === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  const offset = (query.page - 1) * REGISTRY_PAGE_SIZE;

  const [idRows, totals, fleet] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM "Container" c WHERE ${where}
      ORDER BY ${ORDER_BY[query.sort]} ${direction}, c."bicCode" ASC
      LIMIT ${REGISTRY_PAGE_SIZE} OFFSET ${offset}`,
    prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM "Container" c WHERE ${where}`,
    prisma.$queryRaw<{ units: bigint; teu: bigint | null }[]>`
      SELECT count(*) AS units, sum(CASE WHEN "sizeType" LIKE '40%' THEN 2 ELSE 1 END) AS teu FROM "Container" WHERE "deletedAt" IS NULL`,
  ]);

  const ids = idRows.map((r) => r.id);
  const containers = ids.length
    ? await prisma.container.findMany({
        where: { id: { in: ids } },
        include: rowInclude,
      })
    : [];
  const byId = new Map(containers.map((c) => [c.id, c]));
  const total = Number(totals[0]?.total ?? 0);
  return {
    rows: ids.map((id) => byId.get(id)).filter((c) => c !== undefined).map((c) => toContainerRow(c, today)),
    total,
    fleet: { units: Number(fleet[0]?.units ?? 0), teu: Number(fleet[0]?.teu ?? 0) },
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / REGISTRY_PAGE_SIZE)),
  };
}

/** Верхняя граница выгрузки CSV — защита от выгрузки всей базы одним запросом. */
export const REGISTRY_EXPORT_LIMIT = 20_000;

/** Вся выборка по фильтрам (для CSV), в порядке текущей сортировки. */
export async function searchRegistryAll(query: RegistryQuery, today: Date): Promise<ContainerRow[]> {
  const where = whereOf(query, today);
  const direction = query.dir === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  const idRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM "Container" c WHERE ${where}
    ORDER BY ${ORDER_BY[query.sort]} ${direction}, c."bicCode" ASC
    LIMIT ${REGISTRY_EXPORT_LIMIT}`;
  const ids = idRows.map((r) => r.id);
  const containers = ids.length ? await prisma.container.findMany({ where: { id: { in: ids } }, include: rowInclude }) : [];
  const byId = new Map(containers.map((c) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter((c) => c !== undefined).map((c) => toContainerRow(c, today));
}
