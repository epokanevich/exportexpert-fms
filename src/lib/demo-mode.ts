/**
 * Демо-режим: быстрый вход в 1 клик, предзаполненный пароль, гид для проверяющего и кнопка «Сбросить демо-данные».
 * По умолчанию ВЫКЛЮЧЕН (3.5): включается только явной переменной DEMO_MODE=true (демо-стенд на Render).
 * В боевом режиме пароля нет ни на странице входа, ни в клиентском бандле, сброс базы недоступен.
 */
export const DEMO_CREDENTIALS = { email: "admin@exportexpert.ru", password: "Export2026!" } as const;

export function isDemoMode(env: Record<string, string | undefined> = process.env): boolean {
  const value = (env.DEMO_MODE ?? "").trim().toLowerCase();
  return value === "true" || value === "1";
}
