/**
 * Аудит-журнал (3.7): кто (userId) и когда выполнил мутацию. Вызывается с клиентом транзакции операции —
 * запись фиксируется или откатывается вместе с ней.
 */
import type { Prisma } from "@prisma/client";

export type AuditAction =
  | "AUTH_LOGIN"
  | "AUTH_LOGOUT"
  | "USER_PASSWORD_CHANGE"
  | "USER_ROLE_CHANGE"
  | "USER_CREATE"
  | "CONTAINER_CREATE"
  | "CONTAINER_UPDATE"
  | "CONTAINER_WRITE_OFF"
  | "CONTAINER_EVENT_ADD"
  | "ATTACHMENT_UPLOAD"
  | "INSPECTION"
  | "GATE_IN"
  | "GATE_OUT"
  | "CSC_RENEWAL"
  | "ONE_WAY_ISSUE"
  | "ONE_WAY_RETURN"
  | "ONE_WAY_DISPUTE_RESOLVE"
  | "LEASE_CREATE"
  | "LEASE_ACTIVATE"
  | "LEASE_EXTEND"
  | "LEASE_OFF_HIRE"
  | "LEASE_PAYMENT_STATUS"
  | "DEMO_RESET";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  AUTH_LOGIN: "Вход",
  AUTH_LOGOUT: "Выход",
  USER_PASSWORD_CHANGE: "Смена пароля",
  USER_ROLE_CHANGE: "Смена роли",
  USER_CREATE: "Новый пользователь",
  CONTAINER_CREATE: "Контейнер добавлен",
  CONTAINER_UPDATE: "Карточка изменена",
  CONTAINER_WRITE_OFF: "Списание",
  CONTAINER_EVENT_ADD: "Запись в журнал",
  ATTACHMENT_UPLOAD: "Вложение",
  INSPECTION: "Акт осмотра",
  GATE_IN: "Gate-In",
  GATE_OUT: "Gate-Out",
  CSC_RENEWAL: "Продление КБК",
  ONE_WAY_ISSUE: "Выдача One-Way",
  ONE_WAY_RETURN: "Возврат One-Way",
  ONE_WAY_DISPUTE_RESOLVE: "Претензия закрыта",
  LEASE_CREATE: "Договор аренды",
  LEASE_ACTIVATE: "On-Hire по договору",
  LEASE_EXTEND: "Продление аренды",
  LEASE_OFF_HIRE: "Off-Hire",
  LEASE_PAYMENT_STATUS: "Статус оплаты",
  DEMO_RESET: "Сброс демо-данных",
};

export interface AuditEntry {
  /** null — системное действие (ленивая активация договора, bootstrap). */
  actor: { id: string; name: string } | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary: string;
  details?: Prisma.InputJsonValue;
}

export interface AuditWriter {
  auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown> };
}

export async function audit(tx: AuditWriter, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: entry.actor?.id ?? null,
      actorName: entry.actor?.name ?? "Система FMS",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary.slice(0, 1000),
      details: entry.details,
    },
  });
}
