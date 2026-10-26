import { describe, expect, test, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { validateBic } from "@/lib/iso6346";
import { seedDatabase } from "./seed-database";

type Row = Record<string, unknown>;

/** Фейковый Prisma-клиент: собирает всё, что сид записал бы в БД, без подключения к ней. */
function createFakePrisma() {
  const written: Record<string, Row[]> = { container: [], containerEvent: [], oneWayTrip: [], leaseContract: [], leaseItem: [], user: [] };
  const queries: string[] = [];
  const model = (name: string) => ({
    deleteMany: vi.fn(async () => queries.push(`${name}.deleteMany`)),
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      queries.push(`${name}.createMany`);
      written[name].push(...data);
      return { count: data.length };
    }),
    upsert: vi.fn(async ({ create }: { create: Row }) => {
      queries.push(`${name}.upsert`);
      written[name].push(create);
      return create;
    }),
  });
  const tx = {
    container: model("container"),
    containerEvent: model("containerEvent"),
    oneWayTrip: model("oneWayTrip"),
    leaseContract: model("leaseContract"),
    leaseItem: model("leaseItem"),
    user: model("user"),
  };
  const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
  return { prisma: prisma as unknown as PrismaClient, written, queries };
}

describe("seedDatabase (batched)", () => {
  test("writes the full demo fleet with a small, fixed number of queries", async () => {
    const { prisma, written, queries } = createFakePrisma();

    const summary = await seedDatabase(prisma, new Date("2026-10-26T12:00:00.000Z"));

    expect(summary).toEqual({ containers: 31, events: 270, oneWayTrips: 44, leases: 5 });
    expect(written.container).toHaveLength(31);
    expect(written.leaseItem).toHaveLength(11);
    expect(queries.length).toBeLessThanOrEqual(15);
  });

  test("produces valid ISO 6346 numbers and consistent foreign keys", async () => {
    const { prisma, written } = createFakePrisma();
    await seedDatabase(prisma, new Date("2026-10-26T12:00:00.000Z"));

    const containerIds = new Set(written.container.map((c) => c.id as string));
    const leaseIds = new Set(written.leaseContract.map((l) => l.id as string));

    expect(containerIds.size).toBe(31);
    expect(new Set(written.container.map((c) => c.bicCode)).size).toBe(31);
    expect(written.container.every((c) => validateBic(c.bicCode as string).valid)).toBe(true);
    expect(written.containerEvent.every((e) => containerIds.has(e.containerId as string))).toBe(true);
    expect(written.oneWayTrip.every((t) => containerIds.has(t.containerId as string))).toBe(true);
    expect(written.leaseItem.every((i) => containerIds.has(i.containerId as string) && leaseIds.has(i.leaseId as string))).toBe(true);
  });

  test("keeps the demo scenarios: 8 active One-Way, one open dispute, 4 active leases", async () => {
    const { prisma, written } = createFakePrisma();
    await seedDatabase(prisma, new Date("2026-10-26T12:00:00.000Z"));

    expect(written.oneWayTrip.filter((t) => t.status === "ACTIVE")).toHaveLength(8);
    expect(written.oneWayTrip.filter((t) => t.status === "DISPUTE")).toHaveLength(1);
    expect(written.leaseContract.filter((l) => l.status === "ACTIVE")).toHaveLength(4);
    expect(written.user.map((u) => u.email)).toContain("admin@exportexpert.ru");
  });
});
