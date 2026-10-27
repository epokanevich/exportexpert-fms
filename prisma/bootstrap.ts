/**
 * Первый запуск (скрипт сборки на Render/Vercel). Работает только с ПУСТОЙ базой — повторные деплои ничего не меняют:
 *  DEMO_MODE=true → демо-данные; иначе → один администратор с паролем из ADMIN_INITIAL_PASSWORD, без демо-данных.
 */
import bcrypt from "bcryptjs";
import { createPrismaClient } from "../src/lib/prisma";
import { seedDatabase } from "../src/lib/seed/seed-database";
import { planBootstrap } from "../src/lib/bootstrap-plan";
import { isDemoMode } from "../src/lib/demo-mode";
import { BCRYPT_COST } from "../src/lib/auth/password-policy";

async function main(): Promise<void> {
  if (isDemoMode() && process.env.NODE_ENV === "production") {
    process.stdout.write(
      "⚠ DEMO_MODE=true: на странице входа показан пароль администратора, доступен «Сбросить демо-данные». " +
        "Только для демо-стенда — на боевом удалите переменную DEMO_MODE.\n",
    );
  }
  const prisma = createPrismaClient();
  try {
    const [containers, users] = await Promise.all([prisma.container.count(), prisma.user.count()]);
    const plan = planBootstrap({ users, containers }, process.env);
    switch (plan.kind) {
      case "skip":
        process.stdout.write(`✔ Bootstrap: ${plan.reason} — пропускаю.\n`);
        return;
      case "error":
        throw new Error(plan.message);
      case "demo": {
        const summary = await seedDatabase(prisma);
        process.stdout.write(
          `✔ Bootstrap (DEMO_MODE): загружены демо-данные — ${summary.containers} контейнеров, ${summary.oneWayTrips} One-Way, ` +
            `${summary.leases} договоров, ${summary.events} событий.\n`,
        );
        return;
      }
      case "admin": {
        const passwordHash = await bcrypt.hash(plan.password, BCRYPT_COST);
        await prisma.$transaction(async (tx) => {
          const admin = await tx.user.create({ data: { email: plan.email, name: plan.name, role: "ADMIN", passwordHash, passwordChangedAt: new Date() } });
          await tx.auditLog.create({ data: { userId: admin.id, actorName: "Система FMS", action: "USER_CREATE", entityType: "User", entityId: admin.id, summary: `Первый администратор ${admin.email} создан при развёртывании` } });
        });
        process.stdout.write(`✔ Bootstrap: создан администратор ${plan.email}. Смените пароль после первого входа (Профиль → Пароль).\n`);
        return;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = (error instanceof Error ? error.message : String(error)).replace(/postgres(ql)?:\/\/\S+/g, "<DATABASE_URL>");
  process.stderr.write(`✖ Bootstrap не выполнен: ${message}\n`);
  process.exitCode = 1;
});
