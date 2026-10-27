import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Интеграционные тесты на настоящем PostgreSQL: частичные индексы, CHECK, RESTRICT, гонки, AuditLog.
 * Запуск: TEST_DATABASE_URL=postgresql://…/fms_test npm run test:int
 * База очищается и мигрирует (prisma migrate deploy) перед прогоном — никогда не указывайте боевую БД.
 */
const url = process.env.TEST_DATABASE_URL;

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    globalSetup: ["./test/int-global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_URL: url ?? "",
      AUTH_SECRET: "integration-test-secret-0123456789abcdefghijkl",
      BUSINESS_TIMEZONE: "Europe/Moscow",
      ATTACHMENTS_DIR: path.resolve(__dirname, ".data/test-attachments"),
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
