import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", async () => {
  const { currentSession } = await import("../../test/session-mock");
  return { requireSession: vi.fn(async () => currentSession), getSession: vi.fn(async () => currentSession) };
});

import { prisma } from "@/lib/prisma";
import { importContainersAction } from "./containers";
import { buildBic } from "@/lib/iso6346";
import { createContainer, createUser, resetDomain } from "../../test/fixtures";
import { actAsUser } from "../../test/session-mock";

const HEADER = "Номер контейнера;Типоразмер;ISO-код;Год выпуска;Изготовитель;Тара, кг;Брутто, кг;КБК до;UN/LOCODE;Терминал / депо;Дата покупки;Цена покупки, $";
const line = (bic: string, extra = "") => `${bic};40HC;45G1;2021;CIMC;3800;32500;31.12.2028;RUVVO;ВМТП;15.03.2021;4 300,50${extra}`;
const bic = (serial: string) => buildBic("IMPU", serial);

beforeEach(() => resetDomain(prisma));
afterAll(() => prisma.$disconnect());

describe("импорт парка из CSV", () => {
  test("проверка не пишет в БД, запись создаёт контейнеры, события покупки и одну запись аудита", async () => {
    actAsUser(await createUser(prisma, "MANAGER"));
    const csv = [HEADER, line(bic("500001")), line(bic("500002"))].join("\r\n");

    const dry = await importContainersAction(csv, false);
    expect(dry).toMatchObject({ ok: true, total: 2, imported: 0, errors: [] });
    expect(await prisma.container.count()).toBe(0);

    const done = await importContainersAction(csv, true);
    expect(done).toMatchObject({ ok: true, imported: 2 });
    const rows = await prisma.container.findMany({ include: { events: true }, orderBy: { bicCode: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].purchasePriceUsd.toString()).toBe("4300.5");
    expect(rows[0].currentBookValueUsd.toString()).toBe("4300.5");
    expect(rows[0].maxPayloadKg).toBe(28700);
    expect(rows[0].events.map((e) => e.type)).toEqual(["PURCHASE"]);
    expect(await prisma.auditLog.count({ where: { action: "CONTAINER_IMPORT" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "CONTAINER_CREATE" } })).toBe(2);
  });

  test("всё или ничего: одна плохая строка — в БД не попадает ни одна, ошибки с номерами строк", async () => {
    actAsUser(await createUser(prisma, "ADMIN"));
    const wrongCheckDigit = `${bic("500003").slice(0, 10)}${(Number(bic("500003")[10]) + 1) % 10}`;
    const csv = [HEADER, line(bic("500004")), line(wrongCheckDigit), line(bic("500004"))].join("\n");

    const result = await importContainersAction(csv, true);
    expect(result.ok).toBe(false);
    expect(result.imported).toBe(0);
    expect(result.errors.map((e) => e.line)).toEqual([3, 4]);
    expect(result.errors[1].message).toContain("повторяется");
    expect(await prisma.container.count()).toBe(0);
  });

  test("номер, который уже есть в реестре, отклоняется", async () => {
    actAsUser(await createUser(prisma, "ADMIN"));
    const existing = await createContainer(prisma);
    const result = await importContainersAction([HEADER, line(existing.bicCode)].join("\n"), true);
    expect(result).toMatchObject({ ok: false, imported: 0 });
    expect(result.errors[0]).toMatchObject({ line: 2 });
    expect(result.errors[0].message).toContain("уже есть");
    expect(await prisma.container.count()).toBe(1);
  });

  test("INSPECTOR не может импортировать; статусы One-Way/аренды недоступны; формула в примечании сохраняется как текст", async () => {
    actAsUser(await createUser(prisma, "INSPECTOR"));
    expect(await importContainersAction([HEADER, line(bic("500005"))].join("\n"), true)).toMatchObject({ ok: false, message: "Недостаточно прав для этого действия" });

    actAsUser(await createUser(prisma, "MANAGER"));
    const withStatus = `${HEADER};Статус\n${line(bic("500005"), ";ONE_WAY")}`;
    expect((await importContainersAction(withStatus, true)).errors[0].message).toContain("One-Way");

    const withNote = `${HEADER};Примечание\n${line(bic("500005"), ";=1+1")}`;
    expect(await importContainersAction(withNote, true)).toMatchObject({ ok: true, imported: 1 });
    expect((await prisma.container.findFirstOrThrow()).notes).toBe("=1+1");
  });
});
