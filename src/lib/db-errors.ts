/**
 * Перевод ошибок PostgreSQL/Prisma в понятные русские сообщения (1.4, 1.5).
 * null — ошибка не распознана как нарушение правил данных (её нужно логировать как сбой).
 */

const CHECK_LABELS: Record<string, string> = {
  Container_operationalStatus_check: "недопустимый операционный статус",
  Container_techStatus_check: "недопустимый технический статус",
  Container_conditionGrade_check: "недопустимый грейд",
  Container_sizeType_check: "недопустимый типоразмер",
  Container_money_nonnegative_check: "денежная сумма не может быть отрицательной",
  Container_writeoff_consistency_check: "статус «Списан» и дата списания должны быть заданы вместе",
  Container_weights_check: "тара должна быть меньше брутто",
  ContainerEvent_type_check: "недопустимый тип события",
  ContainerEvent_amount_nonnegative_check: "сумма события не может быть отрицательной",
  OneWayTrip_status_check: "недопустимый статус рейса",
  OneWayTrip_money_nonnegative_check: "суммы рейса не могут быть отрицательными",
  OneWayTrip_dates_check: "даты рейса противоречат друг другу",
  OneWayTrip_freeDays_check: "свободных дней должно быть от 0 до 365",
  LeaseContract_status_check: "недопустимый статус договора",
  LeaseContract_money_check: "ставка должна быть больше 0, депозит — не отрицательным",
  LeaseContract_dates_check: "окончание договора должно быть позже начала",
  LeaseRatePeriod_rate_check: "ставка должна быть больше 0",
  LeaseItem_dates_check: "дата Off-Hire раньше даты On-Hire",
  User_role_check: "недопустимая роль пользователя",
};

interface PrismaLikeError {
  code?: unknown;
  meta?: { modelName?: unknown; target?: unknown };
  message?: unknown;
}

function targetFields(meta: PrismaLikeError["meta"]): string[] {
  const target = meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string") return [target];
  return [];
}

export function describeDbError(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as PrismaLikeError;
  const message = typeof e.message === "string" ? e.message : "";

  if (e.code === "P2002") {
    const fields = targetFields(e.meta);
    const model = String(e.meta?.modelName ?? "");
    if (fields.includes("containerId")) {
      return model === "OneWayTrip"
        ? "Контейнер уже в активном рейсе One-Way — обновите страницу"
        : "Контейнер уже числится в действующем договоре аренды — обновите страницу";
    }
    if (fields.includes("bicCode")) return "Контейнер с таким номером уже есть в реестре (в том числе среди списанных)";
    if (fields.includes("contractNumber")) return "Договор с таким номером уже существует";
    if (fields.includes("email")) return "Пользователь с таким email уже существует";
    return "Запись с таким номером уже существует";
  }

  if (e.code === "P2003" || /code: "23001"|code: "23503"|violates (RESTRICT setting of )?foreign key/.test(message)) {
    return "Запись связана с историей операций и не может быть удалена";
  }

  const check = /violates check constraint \\?"([^"\\]+)\\?"/.exec(message);
  if (check || /code: "23514"/.test(message)) {
    const label = check ? CHECK_LABELS[check[1]] : undefined;
    return `Данные не прошли проверку базы данных${label ? `: ${label}` : ""}`;
  }
  return null;
}
