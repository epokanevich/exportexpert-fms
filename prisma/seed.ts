import { createPrismaClient } from "../src/lib/prisma";
import { seedDatabase } from "../src/lib/seed/seed-database";

const prisma = createPrismaClient();

seedDatabase(prisma)
  .then((summary) => {
    process.stdout.write(
      `✔ Демо-данные загружены: ${summary.containers} контейнеров, ${summary.oneWayTrips} One-Way, ` +
        `${summary.leases} договоров аренды, ${summary.events} событий.\n`,
    );
  })
  .catch((error: unknown) => {
    process.stderr.write(`✖ Ошибка сида: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
