/**
 * Права ролей. Проверяются на сервере в каждом Server Action (UI лишь прячет недоступное).
 *  ADMIN     — всё, включая списание контейнеров и сброс демо-данных;
 *  MANAGER   — реестр, One-Way, аренда, инспекция;
 *  INSPECTOR — только терминальные операции: осмотр, Gate-In/Gate-Out, продление КБК.
 */
export type Permission = "fleet:edit" | "fleet:delete" | "operations:manage" | "inspection" | "demo:reset";

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор",
  MANAGER: "Менеджер парка",
  INSPECTOR: "Терминальный инспектор",
};

const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  ADMIN: ["fleet:edit", "fleet:delete", "operations:manage", "inspection", "demo:reset"],
  MANAGER: ["fleet:edit", "operations:manage", "inspection"],
  INSPECTOR: ["inspection"],
};

export function can(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
