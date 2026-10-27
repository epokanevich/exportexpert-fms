/**
 * Применение миграций при деплое (6.1) — вместо `prisma db push`.
 * База, созданная раньше через `db push` (таблицы есть, истории миграций нет), сначала получает baseline:
 * миграция 0_init отмечается применённой (её SQL совпадает со схемой db push), затем `prisma migrate deploy`
 * применяет остальные миграции. Ни одна миграция не удаляет данные. Пустая база — обычный `migrate deploy`.
 */
import { execSync } from "node:child_process";
import { createPrismaClient } from "../src/lib/prisma";

const BASELINE = "0_init";

/** Аргументы — только константы этого файла (без пользовательского ввода). */
function prisma(args: readonly string[]): void {
  execSync(`npx prisma ${args.join(" ")}`, { stdio: "inherit" });
}

async function needsBaseline(): Promise<boolean> {
  const client = createPrismaClient();
  try {
    const rows = await client.$queryRaw<{ has_container: boolean; has_history: boolean }[]>`
      SELECT to_regclass('public."Container"') IS NOT NULL AS has_container,
             to_regclass('public."_prisma_migrations"') IS NOT NULL AS has_history`;
    return Boolean(rows[0]?.has_container) && !rows[0]?.has_history;
  } finally {
    await client.$disconnect();
  }
}

async function main(): Promise<void> {
  if (await needsBaseline()) {
    process.stdout.write(`ℹ База создана через db push: отмечаю ${BASELINE} применённой (baseline), данные не меняются.\n`);
    prisma(["migrate", "resolve", "--applied", BASELINE]);
  }
  prisma(["migrate", "deploy"]);
}

main().catch((error: unknown) => {
  const message = (error instanceof Error ? error.message : String(error)).replace(/postgres(ql)?:\/\/\S+/g, "<DATABASE_URL>");
  process.stderr.write(`✖ Миграции не применены: ${message}\n`);
  process.exitCode = 1;
});
