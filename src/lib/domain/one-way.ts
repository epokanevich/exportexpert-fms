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

export function computeDeadline(handoverDate: Date, freeDays: number): Date {
  return addDays(handoverDate, freeDays);
}

export function computeTripTiming(trip: TripTimingInput, now: Date): TripTiming {
  const stored = trip.status as StoredTripStatus;
  const isClosed = stored === "COMPLETED" || stored === "DISPUTE";
  const referenceDate = isClosed && trip.actualReturnDate ? trip.actualReturnDate : now;

  const daysToDeadline = diffDays(referenceDate, trip.deadlineDate);
  const overdueDays = Math.max(0, -daysToDeadline);
  const detentionUsd = mulRate(trip.detentionRatePerDayUsd, overdueDays);
  const usedDays = diffDays(trip.handoverDate, referenceDate);
  const freeDaysUsedRatio = trip.freeDays > 0 ? Math.min(1, Math.max(0, usedDays / trip.freeDays)) : 1;

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
