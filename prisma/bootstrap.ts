/**
 * Начальная загрузка демо-данных при деплое (Vercel: скрипт vercel-build).
 * Идемпотентно: если в базе уже есть контейнеры или пользователи — ничего не делает,
 * поэтому повторные деплои не затирают рабочие данные.
 */
import { createPrismaClient } from "../src/lib/prisma";
import { seedDatabase } from "../src/lib/seed/seed-database";

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const [containers, users] = await Promise.all([prisma.container.count(), prisma.user.count()]);
    if (containers > 0 || users > 0) {
      process.stdout.write(`✔ Bootstrap: база уже заполнена (контейнеров: ${containers}, пользователей: ${users}) — пропускаю.\n`);
      return;
    }
    const summary = await seedDatabase(prisma);
    process.stdout.write(
      `✔ Bootstrap: загружены демо-данные — ${summary.containers} контейнеров, ${summary.oneWayTrips} One-Way, ` +
        `${summary.leases} договоров, ${summary.events} событий.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = (error instanceof Error ? error.message : String(error)).replace(/postgres(ql)?:\/\/\S+/g, "<DATABASE_URL>");
  process.stderr.write(`✖ Bootstrap не выполнен: ${message}\n`);
  process.exitCode = 1;
});
