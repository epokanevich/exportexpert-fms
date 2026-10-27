/**
 * Демо-режим: быстрый вход в 1 клик, предзаполненный пароль, гид для проверяющего
 * и кнопка «Сбросить демо-данные». Включён по умолчанию — стенд сдаётся проверяющим тестового задания.
 * Для боевого стенда задайте DEMO_MODE=false: пароль исчезнет из страницы входа, сброс базы станет недоступен.
 */
export const DEMO_CREDENTIALS = { email: "admin@exportexpert.ru", password: "Export2026!" } as const;

export function isDemoMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_MODE !== "false";
}
