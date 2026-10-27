import { execSync } from "node:child_process";

/** Свежая схема перед прогоном: DROP SCHEMA + все миграции. Защита от запуска на облачной БД. */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Задайте TEST_DATABASE_URL (локальный PostgreSQL), например postgresql://postgres:postgres@127.0.0.1:5434/fms_test");
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error(`Интеграционные тесты запускаются только на локальной БД, а не на ${host}`);
  const env = { ...process.env, DATABASE_URL: url };
  execSync(`npx prisma db execute --stdin --url "${url}"`, { input: "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;", env, stdio: ["pipe", "ignore", "inherit"] });
  execSync("npx prisma migrate deploy", { env, stdio: ["ignore", "ignore", "inherit"] });
}
