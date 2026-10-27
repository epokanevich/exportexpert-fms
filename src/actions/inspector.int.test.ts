import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", async () => {
  const { currentSession } = await import("../../test/session-mock");
  return { requireSession: vi.fn(async () => currentSession), getSession: vi.fn(async () => currentSession) };
});

import { prisma } from "@/lib/prisma";
import { gateInAction, gateOutAction, inspectContainerAction, renewCscAction } from "./inspector";
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

describe("terminal operations (Gate-In / Gate-Out / CSC) with audit", () => {
  test("Gate-Out of a sound unit on stock, then Gate-In at another depot", async () => {
    const c = await createContainer(prisma);
    expect(await gateOutAction(c.id, { destinationLocode: "RUMOW", note: "ж/д" })).toMatchObject({ ok: true });
    expect((await prisma.container.findUniqueOrThrow({ where: { id: c.id } })).operationalStatus).toBe("IN_TRANSIT");
    // повторный Gate-Out того же контейнера — уже не на стоке
    expect((await gateOutAction(c.id, { destinationLocode: "RUMOW" })).ok).toBe(false);

    expect(await gateInAction(c.id, { locode: "RUMOW", terminal: "ТЛЦ Ворсино" })).toMatchObject({ ok: true });
    const unit = await prisma.container.findUniqueOrThrow({ where: { id: c.id } });
    expect(unit).toMatchObject({ operationalStatus: "AVAILABLE", currentLocode: "RUMOW", currentTerminal: "ТЛЦ Ворсино" });
    expect(await prisma.auditLog.count({ where: { entityId: c.id, action: { in: ["GATE_OUT", "GATE_IN"] } } })).toBe(2);
  });

  test("Gate-Out is refused for an expired CSC plate; renewal unlocks it", async () => {
    const c = await createContainer(prisma, { cscPlateExpiry: new Date("2026-01-01T00:00:00Z") });
    const blocked = await gateOutAction(c.id, { destinationLocode: "RUMOW" });
    expect(blocked).toMatchObject({ ok: false, error: expect.stringMatching(/КБК/) });

    expect((await renewCscAction(c.id, { cscPlateExpiry: "2020-01-01" })).ok).toBe(false); // дата в прошлом
    expect(await renewCscAction(c.id, { cscPlateExpiry: "2031-06-30" })).toMatchObject({ ok: true });
    expect(await gateOutAction(c.id, { destinationLocode: "RUMOW" })).toMatchObject({ ok: true });
  });

  test("Gate-In refuses units in One-Way, lease or written off", async () => {
    const inTrip = await createContainer(prisma, { operationalStatus: "ONE_WAY", storageStartDate: null });
    expect((await gateInAction(inTrip.id, { locode: "RUMOW", terminal: "ТЛЦ" })).ok).toBe(false);
    const off = await createContainer(prisma, { operationalStatus: "WRITTEN_OFF", deletedAt: new Date() });
    expect((await gateInAction(off.id, { locode: "RUMOW", terminal: "ТЛЦ" })).ok).toBe(false);
    expect((await renewCscAction(off.id, { cscPlateExpiry: "2031-06-30" })).ok).toBe(false);
    expect((await inspectContainerAction(off.id, { techStatus: "SOUND", conditionGrade: "CW", eorUsd: "" })).ok).toBe(false);
    expect((await gateInAction("missing", { locode: "RUMOW", terminal: "ТЛЦ" })).ok).toBe(false);
  });

  test("a unit sent to repair goes to MAINTENANCE; Gate-In keeps it there", async () => {
    const c = await createContainer(prisma);
    expect(await inspectContainerAction(c.id, { techStatus: "IN_REPAIR", conditionGrade: "DAMAGED", eorUsd: "300" })).toMatchObject({ ok: true });
    const unit = await prisma.container.findUniqueOrThrow({ where: { id: c.id }, include: { events: true } });
    expect(unit.operationalStatus).toBe("MAINTENANCE");
    expect(unit.events.map((e) => e.type)).toEqual(expect.arrayContaining(["INSPECTION", "REPAIR_START"]));
    expect(await gateInAction(c.id, { locode: "RUVVO", terminal: "ПКТ" })).toMatchObject({ ok: true });
    expect((await prisma.container.findUniqueOrThrow({ where: { id: c.id } })).operationalStatus).toBe("MAINTENANCE");
  });
});
