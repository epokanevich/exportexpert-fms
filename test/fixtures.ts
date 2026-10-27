/** Фикстуры интеграционных тестов: минимальные валидные записи, совместимые с CHECK-ограничениями. */
import { randomUUID } from "node:crypto";
import type { AppPrismaClient } from "@/lib/prisma";
import { buildBic } from "@/lib/iso6346";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
let serial = 100000;

export async function resetDomain(prisma: AppPrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export async function createUser(prisma: AppPrismaClient, role = "ADMIN") {
  return prisma.user.create({ data: { email: `${randomUUID()}@test.local`, name: `Тест ${role}`, role, passwordHash: "x" } });
}

export async function createContainer(prisma: AppPrismaClient, overrides: Record<string, unknown> = {}) {
  serial += 7;
  return prisma.container.create({
    data: {
      bicCode: buildBic("TSTU", String(serial)),
      sizeType: "40HC",
      isoCode: "45G1",
      manufactureYear: 2022,
      colorRal: "RAL 5013",
      manufacturer: "CIMC",
      tareWeightKg: 3900,
      maxPayloadKg: 28600,
      maxGrossWeightKg: 32500,
      conditionGrade: "CW",
      techStatus: "SOUND",
      cscPlateExpiry: d("2030-01-01"),
      operationalStatus: "AVAILABLE",
      currentLocode: "RUVVO",
      currentTerminal: "ВМТП",
      storageStartDate: d("2026-10-01"),
      purchaseDate: d("2022-01-10"),
      purchasePriceUsd: "4300.00",
      currentBookValueUsd: "3500.00",
      ...overrides,
    } as never,
  });
}

export function tripData(containerId: string, overrides: Record<string, unknown> = {}) {
  return {
    containerId,
    counterpartyName: "ООО Тест",
    bookingRef: `OW-${serial}`,
    pickupLocode: "RUVVO",
    pickupTerminal: "ВМТП",
    dropoffLocode: "RUMOW",
    dropoffTerminal: "ТЛЦ Ворсино",
    handoverDate: d("2026-10-01"),
    freeDays: 30,
    deadlineDate: d("2026-10-31"),
    feeUsd: "0.00",
    detentionRatePerDayUsd: "15.00",
    status: "ACTIVE",
    ...overrides,
  } as never;
}

export async function createLease(prisma: AppPrismaClient, containerIds: string[], overrides: Record<string, unknown> = {}) {
  return prisma.leaseContract.create({
    data: {
      contractNumber: `LC-T/${randomUUID().slice(0, 8)}`,
      lesseeName: "ООО Арендатор",
      contactPerson: "Иванов",
      startDate: d("2026-01-01"),
      endDate: d("2027-01-01"),
      dailyRateUsd: "4.00",
      paymentStatus: "PAID",
      allowedReturnLocodes: "RUVVO,RULED",
      status: "ACTIVE",
      items: { create: containerIds.map((containerId) => ({ containerId, onHireDate: d("2026-01-01") })) },
      ratePeriods: { create: { effectiveFrom: d("2026-01-01"), dailyRateUsd: "4.00" } },
      ...overrides,
    } as never,
  });
}
