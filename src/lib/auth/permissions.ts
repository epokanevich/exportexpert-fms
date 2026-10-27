/**
 * Права ролей. Проверяются на сервере в каждом Server Action (UI лишь прячет недоступное).
 *  ADMIN     — всё, включая списание контейнеров, пользователей и роли, аудит-журнал и сброс демо-данных;
 *  MANAGER   — реестр, One-Way, аренда, инспекция;
 *  INSPECTOR — только терминальные операции: осмотр, Gate-In/Gate-Out, продление КБК.
 */
export type Permission = "fleet:edit" | "fleet:delete" | "operations:manage" | "inspection" | "demo:reset" | "users:manage" | "audit:view";

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор",
  MANAGER: "Менеджер парка",
  INSPECTOR: "Терминальный инспектор",
};

const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  ADMIN: ["fleet:edit", "fleet:delete", "operations:manage", "inspection", "demo:reset", "users:manage", "audit:view"],
  MANAGER: ["fleet:edit", "operations:manage", "inspection"],
  INSPECTOR: ["inspection"],
};

export const ROLES = ["ADMIN", "MANAGER", "INSPECTOR"] as const;
export type Role = (typeof ROLES)[number];

export function can(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
