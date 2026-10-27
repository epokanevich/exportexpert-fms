/**
 * Нагрузочный парк для проверки серверного поиска (4.4): дополняет базу до N контейнеров.
 * Только для локальной БД: DATABASE_URL должен указывать на localhost. Запуск:
 *   DATABASE_URL=postgresql://…@127.0.0.1:5434/fms_load npx tsx scripts/generate-load-fleet.ts 5000
 */
import { createPrismaClient } from "../src/lib/prisma";
import { buildBic } from "../src/lib/iso6346";
import { DEFAULT_ISO_CODE, DEFAULT_WEIGHTS, LOCATIONS, SIZE_TYPES } from "../src/lib/domain/constants";

const target = Number(process.argv[2] ?? "5000");
const host = new URL(process.env.DATABASE_URL ?? "postgresql://x@invalid/x").hostname;
if (!["127.0.0.1", "localhost"].includes(host)) throw new Error(`Только локальная БД, а не ${host}`);

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const existing = await prisma.container.count();
  const rows = [];
  for (let i = 0; existing + rows.length < target; i++) {
    const size = SIZE_TYPES[i % SIZE_TYPES.length];
    const loc = LOCATIONS[i % LOCATIONS.length];
    const w = DEFAULT_WEIGHTS[size];
    rows.push({
      bicCode: buildBic(["LDTU", "LDXU", "LDZU"][i % 3], String(100000 + i)),
      sizeType: size,
      isoCode: DEFAULT_ISO_CODE[size],
      manufactureYear: 2015 + (i % 10),
      colorRal: "RAL 5013",
      manufacturer: "CIMC Qingdao",
      tareWeightKg: w.tare,
      maxGrossWeightKg: w.gross,
      maxPayloadKg: w.gross - w.tare,
      conditionGrade: "CW",
      techStatus: i % 17 === 0 ? "DAMAGED" : "SOUND",
      cscPlateExpiry: new Date(Date.UTC(2027 + (i % 3), i % 12, 1 + (i % 27))),
      operationalStatus: i % 5 === 0 ? "IN_TRANSIT" : "AVAILABLE",
      currentLocode: loc.code,
      currentTerminal: loc.terminals[0],
      storageStartDate: i % 5 === 0 ? null : new Date(Date.UTC(2026, 8, 1 + (i % 50))),
      storageRatePerDayUsd: "2.00",
      purchaseDate: new Date(Date.UTC(2022, 0, 1)),
      purchasePriceUsd: "4000.00",
      currentBookValueUsd: "3200.00",
      totalRevenueUsd: String((i * 37) % 9000) + ".00",
    });
  }
  for (let i = 0; i < rows.length; i += 1000) await prisma.container.createMany({ data: rows.slice(i, i + 1000) });
  process.stdout.write(`✔ Добавлено ${rows.length}, всего контейнеров: ${await prisma.container.count()}\n`);
  await prisma.$disconnect();
}

main().catch((e: unknown) => {
  process.stderr.write(`✖ ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
