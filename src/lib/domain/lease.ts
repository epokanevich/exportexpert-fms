import { addDays, daysInMonthUtc, diffDays, startOfMonthUtc } from "@/lib/dates";
import { THRESHOLDS } from "./constants";

export interface LeaseItemInput {
  onHireDate: Date;
  offHireDate: Date | null;
}

export interface LeaseInput {
  status: string;
  endDate: Date;
  dailyRateUsd: number;
  paymentStatus: string;
  items: readonly LeaseItemInput[];
}

export type LeaseExpiryLevel = "EXPIRED" | "CRITICAL" | "WARNING" | "OK" | "CLOSED";

export interface LeaseMetrics {
  activeUnits: number;
  totalUnits: number;
  daysToEnd: number;
  expiryLevel: LeaseExpiryLevel;
  /** Начислено за текущий календарный месяц по сегодняшний день включительно. */
  accruedThisMonthUsd: number;
  /** Начислено за весь срок договора. */
  accruedTotalUsd: number;
  /** Плановый доход в месяц при текущем числе единиц на руках. */
  monthlyRunRateUsd: number;
  needsAttention: boolean;
}

/** Дни аренды единицы в интервале [from, to] включительно, с учётом On-Hire/Off-Hire. */
export function rentalDaysInRange(item: LeaseItemInput, from: Date, to: Date): number {
  const start = item.onHireDate > from ? item.onHireDate : from;
  // День Off-Hire не тарифицируется, поэтому последний оплачиваемый день — накануне.
  const lastBillable = item.offHireDate ? addDays(item.offHireDate, -1) : to;
  const end = lastBillable < to ? lastBillable : to;
  const days = diffDays(start, end) + 1;
  return Math.max(0, days);
}

export function expiryLevelOf(daysToEnd: number, isClosed: boolean): LeaseExpiryLevel {
  if (isClosed) return "CLOSED";
  if (daysToEnd < 0) return "EXPIRED";
  if (daysToEnd <= THRESHOLDS.leaseExpiringCriticalDays) return "CRITICAL";
  if (daysToEnd <= THRESHOLDS.leaseExpiringWarningDays) return "WARNING";
  return "OK";
}

export function computeLeaseMetrics(lease: LeaseInput, now: Date): LeaseMetrics {
  const isClosed = lease.status === "COMPLETED";
  const activeUnits = lease.items.filter((i) => !i.offHireDate).length;
  const daysToEnd = diffDays(now, lease.endDate);
  const monthStart = startOfMonthUtc(now);
  const farPast = new Date(0);

  const accruedThisMonthUsd = lease.items.reduce(
    (sum, item) => sum + rentalDaysInRange(item, monthStart, now) * lease.dailyRateUsd,
    0,
  );
  const accruedTotalUsd = lease.items.reduce(
    (sum, item) => sum + rentalDaysInRange(item, farPast, now) * lease.dailyRateUsd,
    0,
  );
  const expiryLevel = expiryLevelOf(daysToEnd, isClosed);

  return {
    activeUnits,
    totalUnits: lease.items.length,
    daysToEnd,
    expiryLevel,
    accruedThisMonthUsd,
    accruedTotalUsd,
    monthlyRunRateUsd: activeUnits * lease.dailyRateUsd * daysInMonthUtc(now),
    needsAttention:
      !isClosed && (lease.paymentStatus === "OVERDUE" || expiryLevel === "CRITICAL" || expiryLevel === "WARNING" || expiryLevel === "EXPIRED"),
  };
}

export function parseLocodeList(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}
