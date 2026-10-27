/** Что делать при первом запуске (prisma/bootstrap.ts). Чистая функция — покрыта тестами. */
import { isDemoMode } from "./demo-mode";
import { passwordProblem } from "./auth/password-policy";

export type BootstrapPlan =
  | { kind: "skip"; reason: string }
  | { kind: "demo" }
  | { kind: "admin"; email: string; name: string; password: string }
  | { kind: "error"; message: string };

export function planBootstrap(counts: { users: number; containers: number }, env: Record<string, string | undefined>): BootstrapPlan {
  if (counts.users > 0 || counts.containers > 0) {
    return { kind: "skip", reason: `База уже заполнена (пользователей: ${counts.users}, контейнеров: ${counts.containers})` };
  }
  if (isDemoMode(env)) return { kind: "demo" };

  const password = env.ADMIN_INITIAL_PASSWORD;
  if (!password) {
    return { kind: "error", message: "Пустая база и DEMO_MODE выключен: задайте ADMIN_INITIAL_PASSWORD (≥ 10 символов) для первого администратора" };
  }
  const email = (env.ADMIN_EMAIL || "admin@exportexpert.ru").trim().toLowerCase();
  const problem = passwordProblem(password, { email });
  if (problem) return { kind: "error", message: `ADMIN_INITIAL_PASSWORD не подходит: ${problem}` };
  return { kind: "admin", email, name: env.ADMIN_NAME?.trim() || "Администратор", password };
}
