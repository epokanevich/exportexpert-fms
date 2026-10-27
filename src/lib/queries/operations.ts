import "server-only";
import { prisma } from "@/lib/prisma";
import { computeTripTiming, type TripTiming } from "@/lib/domain/one-way";
import { computeLeaseMetrics, effectiveLeaseStatus, parseLocodeList, type LeaseMetrics, type RatePeriodInput } from "@/lib/domain/lease";
import type { NavBadges } from "@/components/layout/nav-items";

export interface TripRow {
  id: string;
  containerId: string;
  bicCode: string;
  sizeType: string;
  counterpartyName: string;
  counterpartyInn: string | null;
  counterpartyContact: string | null;
  bookingRef: string;
  pickupLocode: string;
  pickupTerminal: string;
  dropoffLocode: string;
  dropoffTerminal: string;
  handoverDate: Date;
  freeDays: number;
  deadlineDate: Date;
  actualReturnDate: Date | null;
  feeUsd: number;
  detentionRatePerDayUsd: number;
  returnCondition: string | null;
  returnEorUsd: number | null;
  notes: string | null;
  timing: TripTiming;
}

export async function getTripRows(now: Date): Promise<TripRow[]> {
  const trips = await prisma.oneWayTrip.findMany({
    include: { container: { select: { bicCode: true, sizeType: true } } },
    orderBy: { deadlineDate: "asc" },
  });
  return trips.map(({ container, createdAt: _c, updatedAt: _u, status: _s, ...trip }) => ({
    ...trip,
    bicCode: container.bicCode,
    sizeType: container.sizeType,
    timing: computeTripTiming({ ...trip, status: _s }, now),
  }));
}

export interface LeaseRow {
  id: string;
  contractNumber: string;
  lesseeName: string;
  lesseeInn: string | null;
  contactPerson: string;
  contactPhone: string | null;
  contactEmail: string | null;
  startDate: Date;
  endDate: Date;
  autoRenewal: boolean;
  dailyRateUsd: number;
  currency: string;
  depositUsd: number;
  paymentStatus: string;
  allowedReturnLocodes: string[];
  onHireSurvey: string;
  offHireSurvey: string;
  status: string;
  notes: string | null;
  /** История ставок Per Diem (D-08), по возрастанию даты. */
  ratePeriods: RatePeriodInput[];
  /** Бизнес-дата, на которую посчитаны метрики (D-28) — клиентские калькуляторы берут «сегодня» отсюда. */
  asOf: Date;
  metrics: LeaseMetrics;
  items: {
    id: string;
    containerId: string;
    bicCode: string;
    sizeType: string;
    techStatus: string;
    onHireDate: Date;
    offHireDate: Date | null;
    returnLocode: string | null;
  }[];
}

const leaseInclude = {
  ratePeriods: { orderBy: { effectiveFrom: "asc" as const }, select: { effectiveFrom: true, dailyRateUsd: true } },
  items: { include: { container: { select: { bicCode: true, sizeType: true, techStatus: true } } }, orderBy: { onHireDate: "asc" as const } },
};

type LeaseWithItems = Awaited<ReturnType<typeof prisma.leaseContract.findMany<{ include: typeof leaseInclude }>>>[number];

function toLeaseRow(lease: LeaseWithItems, now: Date): LeaseRow {
  return {
    id: lease.id,
    contractNumber: lease.contractNumber,
    lesseeName: lease.lesseeName,
    lesseeInn: lease.lesseeInn,
    contactPerson: lease.contactPerson,
    contactPhone: lease.contactPhone,
    contactEmail: lease.contactEmail,
    startDate: lease.startDate,
    endDate: lease.endDate,
    autoRenewal: lease.autoRenewal,
    dailyRateUsd: lease.dailyRateUsd,
    currency: lease.currency,
    depositUsd: lease.depositUsd,
    paymentStatus: lease.paymentStatus,
    allowedReturnLocodes: parseLocodeList(lease.allowedReturnLocodes),
    onHireSurvey: lease.onHireSurvey,
    offHireSurvey: lease.offHireSurvey,
    status: effectiveLeaseStatus(lease, now),
    notes: lease.notes,
    ratePeriods: lease.ratePeriods,
    asOf: now,
    metrics: computeLeaseMetrics(lease, now),
    items: lease.items.map((item) => ({
      id: item.id,
      containerId: item.containerId,
      bicCode: item.container.bicCode,
      sizeType: item.container.sizeType,
      techStatus: item.container.techStatus,
      onHireDate: item.onHireDate,
      offHireDate: item.offHireDate,
      returnLocode: item.returnLocode,
    })),
  };
}

export async function getLeaseRows(now: Date): Promise<LeaseRow[]> {
  const leases = await prisma.leaseContract.findMany({ include: leaseInclude, orderBy: [{ status: "asc" }, { endDate: "asc" }] });
  return leases.map((l) => toLeaseRow(l, now));
}

export async function getLeaseRow(id: string, now: Date): Promise<LeaseRow | null> {
  const lease = await prisma.leaseContract.findUnique({ where: { id }, include: leaseInclude });
  return lease ? toLeaseRow(lease, now) : null;
}

export async function getNavBadges(now: Date): Promise<NavBadges> {
  const [trips, leases] = await Promise.all([
    prisma.oneWayTrip.findMany({ where: { status: "ACTIVE" } }),
    prisma.leaseContract.findMany({ where: { status: "ACTIVE" }, include: { items: true, ratePeriods: true } }),
  ]);
  return {
    oneWayOverdue: trips.filter((t) => computeTripTiming(t, now).status === "OVERDUE").length,
    leaseAttention: leases.filter((l) => computeLeaseMetrics(l, now).needsAttention).length,
  };
}
