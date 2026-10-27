import { addDays, diffDays } from "@/lib/dates";
import { mulRate } from "@/lib/money";
import { THRESHOLDS, type StoredTripStatus, type TripStatus } from "./constants";

export interface TripTimingInput {
  status: string;
  handoverDate: Date;
  freeDays: number;
  deadlineDate: Date;
  actualReturnDate: Date | null;
  detentionRatePerDayUsd: number;
}

export interface TripTiming {
  /** Эффективный статус: ACTIVE с прошедшим дедлайном становится OVERDUE. */
  status: TripStatus;
  /** Сколько свободных дней осталось (только для ACTIVE). */
  daysLeft: number | null;
  /** Дней просрочки на сегодня или на дату фактического возврата. */
  overdueDays: number;
  /** Начисленный детеншн, USD. */
  detentionUsd: number;
  /** Дедлайн ≤ 5 дней и ещё не наступил. */
  isHot: boolean;
  /** Доля использованных свободных дней 0..1 (для прогресс-бара). */
  freeDaysUsedRatio: number;
}

/**
 * Конвенция Free Time (D-20) — единственная настройка, от неё зависит дедлайн новых рейсов:
 *  DAY_AFTER_GATE_OUT     — день 1 = следующий день после Gate-Out (бесплатно N + 1 календарный день);
 *  GATE_OUT_DAY_IS_DAY_1  — отраслевая норма: день выдачи = день 1 (последний бесплатный день = выдача + N − 1).
 * Дедлайн сохраняется в рейсе при выдаче и печатается в Release Order, поэтому смена конвенции
 * не меняет сроки и детеншн уже выданных рейсов.
 */
export type FreeTimeConvention = "DAY_AFTER_GATE_OUT" | "GATE_OUT_DAY_IS_DAY_1";
export const FREE_TIME_CONVENTION: FreeTimeConvention = "DAY_AFTER_GATE_OUT";

export const FREE_TIME_CONVENTION_LABELS: Record<FreeTimeConvention, string> = {
  DAY_AFTER_GATE_OUT: "день 1 — следующий день после Gate-Out",
  GATE_OUT_DAY_IS_DAY_1: "день Gate-Out — день 1",
};

/** Последний бесплатный день. Детеншн начисляется за каждые сутки после него, включая день Gate-In. */
export function computeDeadline(handoverDate: Date, freeDays: number, convention: FreeTimeConvention = FREE_TIME_CONVENTION): Date {
  return addDays(handoverDate, convention === "GATE_OUT_DAY_IS_DAY_1" ? freeDays - 1 : freeDays);
}

export function computeTripTiming(trip: TripTimingInput, now: Date): TripTiming {
  const stored = trip.status as StoredTripStatus;
  const isClosed = stored === "COMPLETED" || stored === "DISPUTE";
  const referenceDate = isClosed && trip.actualReturnDate ? trip.actualReturnDate : now;

  const daysToDeadline = diffDays(referenceDate, trip.deadlineDate);
  const overdueDays = Math.max(0, -daysToDeadline);
  const detentionUsd = mulRate(trip.detentionRatePerDayUsd, overdueDays);
  // Доля использованных свободных дней — от сохранённого дедлайна, поэтому верна для обеих конвенций.
  const freeDaysUsedRatio = trip.freeDays > 0 ? Math.min(1, Math.max(0, 1 - daysToDeadline / trip.freeDays)) : 1;

  if (isClosed) {
    return { status: stored, daysLeft: null, overdueDays, detentionUsd, isHot: false, freeDaysUsedRatio };
  }

  const isOverdue = overdueDays > 0;
  return {
    status: isOverdue ? "OVERDUE" : "ACTIVE",
    daysLeft: isOverdue ? null : daysToDeadline,
    overdueDays,
    detentionUsd,
    isHot: !isOverdue && daysToDeadline <= THRESHOLDS.oneWayHotDays,
    freeDaysUsedRatio,
  };
}
