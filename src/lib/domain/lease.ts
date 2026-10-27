import { addDays, daysInMonthUtc, diffDays, startOfDayUtc, startOfMonthUtc } from "@/lib/dates";
import { mulRate, sumMoney } from "@/lib/money";
import { THRESHOLDS } from "./constants";

export interface LeaseItemInput {
  onHireDate: Date;
  offHireDate: Date | null;
}

/** Период действия ставки Per Diem: с effectiveFrom (включительно) до начала следующего периода. */
export interface RatePeriodInput {
  effectiveFrom: Date;
  dailyRateUsd: number;
}

export interface LeaseInput {
  status: string;
  startDate?: Date;
  endDate: Date;
  /** Текущая ставка договора (последний период). Используется, если история ставок не загружена. */
  dailyRateUsd: number;
  paymentStatus: string;
  ratePeriods?: readonly RatePeriodInput[];
  items: readonly LeaseItemInput[];
}

export type LeaseExpiryLevel = "EXPIRED" | "CRITICAL" | "WARNING" | "OK" | "CLOSED" | "SCHEDULED";

export interface LeaseMetrics {
  activeUnits: number;
  totalUnits: number;
  daysToEnd: number;
  expiryLevel: LeaseExpiryLevel;
  /** Начислено за текущий календарный месяц по сегодняшний день включительно. */
  accruedThisMonthUsd: number;
  /** Начислено за весь срок договора. */
  accruedTotalUsd: number;
  /** Плановый доход в месяц при текущем числе единиц на руках и действующей ставке. */
  monthlyRunRateUsd: number;
  /** Ставка, действующая сегодня. */
  currentRateUsd: number;
  needsAttention: boolean;
}

/** Дни аренды единицы в интервале [from, to] включительно, с учётом On-Hire/Off-Hire. */
export function rentalDaysInRange(item: LeaseItemInput, from: Date, to: Date): number {
  const range = rentalRange(item, from, to);
  return range ? diffDays(range.from, range.to) + 1 : 0;
}

function rentalRange(item: LeaseItemInput, from: Date, to: Date): { from: Date; to: Date } | null {
  const start = startOfDayUtc(item.onHireDate > from ? item.onHireDate : from);
  // День Off-Hire не тарифицируется, поэтому последний оплачиваемый день — накануне.
  const lastBillable = item.offHireDate ? addDays(startOfDayUtc(item.offHireDate), -1) : startOfDayUtc(to);
  const end = lastBillable < startOfDayUtc(to) ? lastBillable : startOfDayUtc(to);
  return end < start ? null : { from: start, to: end };
}

function sortedPeriods(periods: readonly RatePeriodInput[]): RatePeriodInput[] {
  return [...periods].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
}

export interface RateSegment {
  from: Date;
  to: Date;
  rateUsd: number;
}

/** Разбивка интервала [from, to] по периодам ставок. Дни до первого периода — по первой ставке. */
export function rateSegments(periods: readonly RatePeriodInput[], from: Date, to: Date): RateSegment[] {
  const sorted = sortedPeriods(periods);
  const start = startOfDayUtc(from);
  const end = startOfDayUtc(to);
  if (sorted.length === 0 || end < start) return [];
  const segments: RateSegment[] = [];
  sorted.forEach((period, i) => {
    const periodStart = i === 0 ? start : startOfDayUtc(period.effectiveFrom);
    const next = sorted[i + 1];
    const periodEnd = next ? addDays(startOfDayUtc(next.effectiveFrom), -1) : end;
    const segFrom = periodStart > start ? periodStart : start;
    const segTo = periodEnd < end ? periodEnd : end;
    if (segFrom <= segTo) segments.push({ from: segFrom, to: segTo, rateUsd: period.dailyRateUsd });
  });
  return segments;
}

export interface ItemAccrual {
  days: number;
  amountUsd: number;
  segments: (RateSegment & { days: number; amountUsd: number })[];
}

/** Начисление по единице за [from, to]: каждый день — по ставке, действовавшей в этот день. */
export function accrueItem(item: LeaseItemInput, periods: readonly RatePeriodInput[], from: Date, to: Date): ItemAccrual {
  const range = rentalRange(item, from, to);
  if (!range) return { days: 0, amountUsd: 0, segments: [] };
  const segments = rateSegments(periods, range.from, range.to).map((s) => {
    const days = diffDays(s.from, s.to) + 1;
    return { ...s, days, amountUsd: mulRate(s.rateUsd, days) };
  });
  return {
    days: segments.reduce((sum, s) => sum + s.days, 0),
    amountUsd: sumMoney(segments.map((s) => s.amountUsd)),
    segments,
  };
}

/** Ставка, действующая на дату. Без истории — ставка договора. */
export function currentRate(periods: readonly RatePeriodInput[], fallbackRateUsd: number, on: Date): number {
  const day = startOfDayUtc(on);
  const inForce = sortedPeriods(periods).filter((p) => startOfDayUtc(p.effectiveFrom) <= day);
  return inForce.at(-1)?.dailyRateUsd ?? sortedPeriods(periods)[0]?.dailyRateUsd ?? fallbackRateUsd;
}

function periodsOf(lease: LeaseInput): readonly RatePeriodInput[] {
  if (lease.ratePeriods && lease.ratePeriods.length > 0) return lease.ratePeriods;
  return [{ effectiveFrom: new Date(0), dailyRateUsd: lease.dailyRateUsd }];
}

/** SCHEDULED — договор оформлен, но дата On-Hire ещё не наступила (D-19): не «в аренде», не в $/мес. */
export function effectiveLeaseStatus(lease: Pick<LeaseInput, "status" | "startDate">, now: Date): "ACTIVE" | "SCHEDULED" | "COMPLETED" {
  if (lease.status === "COMPLETED") return "COMPLETED";
  if (lease.startDate && startOfDayUtc(lease.startDate) > startOfDayUtc(now)) return "SCHEDULED";
  return "ACTIVE";
}

export function expiryLevelOf(daysToEnd: number, isClosed: boolean): LeaseExpiryLevel {
  if (isClosed) return "CLOSED";
  if (daysToEnd < 0) return "EXPIRED";
  if (daysToEnd <= THRESHOLDS.leaseExpiringCriticalDays) return "CRITICAL";
  if (daysToEnd <= THRESHOLDS.leaseExpiringWarningDays) return "WARNING";
  return "OK";
}

export function computeLeaseMetrics(lease: LeaseInput, now: Date): LeaseMetrics {
  const status = effectiveLeaseStatus(lease, now);
  const isClosed = status === "COMPLETED";
  const today = startOfDayUtc(now);
  const periods = periodsOf(lease);
  const activeUnits = lease.items.filter((i) => !i.offHireDate && startOfDayUtc(i.onHireDate) <= today).length;
  const daysToEnd = diffDays(now, lease.endDate);
  const monthStart = startOfMonthUtc(now);
  const farPast = new Date(0);
  const rate = currentRate(periods, lease.dailyRateUsd, now);

  const accruedThisMonthUsd = sumMoney(lease.items.map((item) => accrueItem(item, periods, monthStart, now).amountUsd));
  const accruedTotalUsd = sumMoney(lease.items.map((item) => accrueItem(item, periods, farPast, now).amountUsd));
  const expiryLevel = status === "SCHEDULED" ? "SCHEDULED" : expiryLevelOf(daysToEnd, isClosed);

  return {
    activeUnits,
    totalUnits: lease.items.length,
    daysToEnd,
    expiryLevel,
    accruedThisMonthUsd,
    accruedTotalUsd,
    monthlyRunRateUsd: mulRate(rate, activeUnits * daysInMonthUtc(now)),
    currentRateUsd: rate,
    needsAttention:
      status === "ACTIVE" && (lease.paymentStatus === "OVERDUE" || expiryLevel === "CRITICAL" || expiryLevel === "WARNING" || expiryLevel === "EXPIRED"),
  };
}

export function parseLocodeList(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}
