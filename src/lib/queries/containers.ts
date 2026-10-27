import "server-only";
import { prisma } from "@/lib/prisma";
import { businessToday } from "@/lib/business-time";
import { attentionFlagsOf, issueBlockReason, unitEconomicsOf, type CscState } from "@/lib/domain/container";
import { computeTripTiming, type TripTiming } from "@/lib/domain/one-way";
import { locodeCity } from "@/lib/domain/constants";

export interface ContainerEventDto {
  id: string;
  type: string;
  occurredAt: Date;
  locode: string | null;
  terminal: string | null;
  description: string;
  amountUsd: number | null;
  actor: string | null;
  attachments?: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
}

export interface ContainerRow {
  id: string;
  bicCode: string;
  sizeType: string;
  isoCode: string;
  manufactureYear: number;
  manufacturer: string;
  conditionGrade: string;
  techStatus: string;
  operationalStatus: string;
  currentLocode: string;
  currentTerminal: string;
  cscPlateExpiry: Date;
  csc: CscState;
  idleDays: number | null;
  isIdleTooLong: boolean;
  storageCostUsd: number;
  eorAmountUsd: number | null;
  roi: number;
  totalRevenueUsd: number;
  needsAttention: boolean;
  needsRepair: boolean;
  /** Краткое описание текущей операции: «OW-2026-0912 → Москва» / «LC-2025/014». */
  activity: string | null;
  activityHref: string | null;
  tripTiming: TripTiming | null;
  recentEvents: ContainerEventDto[];
}

const RECENT_EVENTS = 4;

export async function getContainerRows(now: Date): Promise<ContainerRow[]> {
  const containers = await prisma.container.findMany({
    where: { deletedAt: null },
    orderBy: { bicCode: "asc" },
    include: {
      events: { orderBy: { occurredAt: "desc" }, take: RECENT_EVENTS },
      oneWayTrips: { where: { status: "ACTIVE" }, take: 1 },
      leaseItems: { where: { offHireDate: null, lease: { status: { in: ["ACTIVE", "SCHEDULED"] } } }, include: { lease: true }, take: 1 },
    },
  });

  return containers.map((c) => {
    const flags = attentionFlagsOf(c, now);
    const trip = c.oneWayTrips[0];
    const leaseItem = c.leaseItems[0];
    const activity = trip
      ? `${trip.bookingRef} → ${locodeCity(trip.dropoffLocode)}`
      : leaseItem
        ? `${leaseItem.lease.contractNumber} · ${leaseItem.lease.lesseeName}`
        : null;
    const activityHref = trip ? `/one-way?focus=${trip.id}` : leaseItem ? `/leases/${leaseItem.lease.id}` : null;

    return {
      id: c.id,
      bicCode: c.bicCode,
      sizeType: c.sizeType,
      isoCode: c.isoCode,
      manufactureYear: c.manufactureYear,
      manufacturer: c.manufacturer,
      conditionGrade: c.conditionGrade,
      techStatus: c.techStatus,
      operationalStatus: c.operationalStatus,
      currentLocode: c.currentLocode,
      currentTerminal: c.currentTerminal,
      cscPlateExpiry: c.cscPlateExpiry,
      csc: flags.csc,
      idleDays: flags.storage.idleDays,
      isIdleTooLong: flags.storage.isIdleTooLong,
      storageCostUsd: flags.storage.storageCostUsd,
      eorAmountUsd: c.eorAmountUsd,
      roi: unitEconomicsOf(c).roi,
      totalRevenueUsd: c.totalRevenueUsd,
      needsAttention: flags.any,
      needsRepair: flags.needsRepair,
      activity,
      activityHref,
      tripTiming: trip ? computeTripTiming(trip, now) : null,
      recentEvents: c.events,
    };
  });
}

export async function getContainerProfile(id: string) {
  return prisma.container.findUnique({
    where: { id },
    include: {
      events: {
        orderBy: { occurredAt: "desc" },
        include: { attachments: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } },
      },
      damages: { where: { status: "OPEN" }, orderBy: { createdAt: "asc" } },
      oneWayTrips: { orderBy: { handoverDate: "desc" } },
      leaseItems: { orderBy: { onHireDate: "desc" }, include: { lease: { include: { ratePeriods: { orderBy: { effectiveFrom: "asc" } } } } } },
    },
  });
}

export type ContainerProfile = NonNullable<Awaited<ReturnType<typeof getContainerProfile>>>;

export interface IssuableContainer {
  id: string;
  bicCode: string;
  sizeType: string;
  currentLocode: string;
  currentTerminal: string;
  conditionGrade: string;
  /** Причина запрета выдачи; null — контейнер можно выдать. */
  blockReason: string | null;
}

/**
 * Контейнеры на стоке — кандидаты на выдачу (One-Way / аренда).
 * Заблокированные (неисправен, просрочена КБК) возвращаются с причиной, чтобы форма показала её явно.
 */
export async function getIssuableContainers(now: Date = businessToday()): Promise<IssuableContainer[]> {
  const containers = await prisma.container.findMany({
    where: { operationalStatus: "AVAILABLE", deletedAt: null },
    orderBy: [{ currentLocode: "asc" }, { bicCode: "asc" }],
    select: { id: true, bicCode: true, sizeType: true, currentLocode: true, currentTerminal: true, conditionGrade: true, operationalStatus: true, techStatus: true, cscPlateExpiry: true },
  });
  return containers
    .map(({ operationalStatus, techStatus, cscPlateExpiry, ...c }) => ({ ...c, blockReason: issueBlockReason({ operationalStatus, techStatus, cscPlateExpiry }, now) }))
    .sort((a, b) => Number(a.blockReason !== null) - Number(b.blockReason !== null));
}
