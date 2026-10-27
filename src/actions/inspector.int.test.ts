import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", async () => {
  const { currentSession } = await import("../../test/session-mock");
  return { requireSession: vi.fn(async () => currentSession), getSession: vi.fn(async () => currentSession) };
});

import { prisma } from "@/lib/prisma";
import { inspectContainerAction } from "./inspector";
import { createContainer, createUser, resetDomain } from "../../test/fixtures";
import { actAsUser } from "../../test/session-mock";

beforeEach(async () => {
  await resetDomain(prisma);
  actAsUser(await createUser(prisma, "INSPECTOR"));
});
afterAll(() => prisma.$disconnect());

describe("inspection with CEDEX damage lines (2.5)", () => {
  test("damage lines are stored, EOR = their sum; repair closes them and books the cost once", async () => {
    const c = await createContainer(prisma);

    const damaged = await inspectContainerAction(c.id, {
      techStatus: "DAMAGED",
      conditionGrade: "DAMAGED",
      eorUsd: "",
      damages: [
        { locationCode: "lx2n", component: "Боковая панель", damageCode: "HO", repairCode: "PA", lengthCm: 30, widthCm: 12, quantity: 1, costUsd: 240.1 },
        { locationCode: "BX1N", component: "Пол", damageCode: "CK", repairCode: "RP", quantity: 2, costUsd: 0.2 },
      ],
    });
    expect(damaged, JSON.stringify(damaged)).toMatchObject({ ok: true });

    let unit = await prisma.container.findUniqueOrThrow({ where: { id: c.id }, include: { damages: true, events: true } });
    expect(unit.eorAmountUsd).toBe(240.3);
    expect(unit.damages.map((d) => [d.locationCode, d.damageCode, d.status])).toEqual([
      ["LX2N", "HO", "OPEN"],
      ["BX1N", "CK", "OPEN"],
    ]);
    expect(unit.events.find((e) => e.type === "INSPECTION")?.description).toContain("LX2N Боковая панель — HO (пробоина) 30×12 см → PA (заплата)");

    // Два одновременных акта «исправен»: ремонт закрывается один раз, затраты не задваиваются.
    const results = await Promise.all([
      inspectContainerAction(c.id, { techStatus: "SOUND", conditionGrade: "CW", eorUsd: "" }),
      inspectContainerAction(c.id, { techStatus: "SOUND", conditionGrade: "CW", eorUsd: "" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);

    unit = await prisma.container.findUniqueOrThrow({ where: { id: c.id }, include: { damages: true, events: true } });
    expect(unit.techStatus).toBe("SOUND");
    expect(unit.totalRepairCostUsd).toBe(240.3);
    expect(unit.damages.every((d) => d.status === "REPAIRED")).toBe(true);
    expect(unit.events.filter((e) => e.type === "REPAIR_DONE")).toHaveLength(1);
  });

  test("invalid CEDEX codes are rejected before touching the database", async () => {
    const c = await createContainer(prisma);
    const result = await inspectContainerAction(c.id, {
      techStatus: "DAMAGED", conditionGrade: "DAMAGED", eorUsd: "100",
      damages: [{ locationCode: "LEFT", component: "Панель", damageCode: "DENT", quantity: 1 }],
    });
    expect(result.ok).toBe(false);
    expect(await prisma.damageItem.count()).toBe(0);
  });
});
