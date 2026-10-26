import { attentionFlagsOf, type AttentionInput } from "./container";
import { computeLeaseMetrics, type LeaseInput } from "./lease";
import { computeTripTiming, type TripTimingInput } from "./one-way";
import {
  OPERATIONAL_STATUSES,
  REGIONS,
  UTILIZED_STATUSES,
  isOneOf,
  locodeRegion,
  teuOf,
  type OperationalStatus,
} from "./constants";

export interface FleetContainerInput extends AttentionInput {
  sizeType: string;
  currentLocode: string;
}

export interface FleetKpi {
  totalUnits: number;
  totalTeu: number;
  utilizationRate: number;
  utilizedUnits: number;
  oneWay: { active: number; hot: number; overdue: number; detentionUsd: number };
  lease: { activeContracts: number; unitsOnHire: number; monthlyRevenueUsd: number; attention: number };
  attention: { total: number; csc: number; repair: number; idle: number };
  byRegion: { region: string; units: number; teu: number }[];
  byStatus: { status: OperationalStatus; units: number }[];
}

export function computeFleetKpi(
  containers: readonly FleetContainerInput[],
  trips: readonly TripTimingInput[],
  leases: readonly LeaseInput[],
  now: Date,
): FleetKpi {
  const totalUnits = containers.length;
  const totalTeu = containers.reduce((sum, c) => sum + teuOf(c.sizeType), 0);
  const utilizedUnits = containers.filter(
    (c) => isOneOf(OPERATIONAL_STATUSES, c.operationalStatus) && UTILIZED_STATUSES.includes(c.operationalStatus),
  ).length;

  const tripTimings = trips.map((t) => computeTripTiming(t, now));
  const openTrips = tripTimings.filter((t) => t.status === "ACTIVE" || t.status === "OVERDUE");

  const leaseMetrics = leases.filter((l) => l.status === "ACTIVE").map((l) => computeLeaseMetrics(l, now));

  const flags = containers.map((c) => attentionFlagsOf(c, now));

  const regionOrder: string[] = [...REGIONS, "Прочие"];
  const byRegion = regionOrder
    .map((region) => {
      const inRegion = containers.filter((c) => locodeRegion(c.currentLocode) === region);
      return { region, units: inRegion.length, teu: inRegion.reduce((s, c) => s + teuOf(c.sizeType), 0) };
    })
    .filter((r) => r.units > 0);

  const byStatus = OPERATIONAL_STATUSES.map((status) => ({
    status,
    units: containers.filter((c) => c.operationalStatus === status).length,
  }));

  return {
    totalUnits,
    totalTeu,
    utilizedUnits,
    utilizationRate: totalUnits > 0 ? utilizedUnits / totalUnits : 0,
    oneWay: {
      active: openTrips.length,
      hot: openTrips.filter((t) => t.isHot).length,
      overdue: openTrips.filter((t) => t.status === "OVERDUE").length,
      detentionUsd: openTrips.reduce((s, t) => s + t.detentionUsd, 0),
    },
    lease: {
      activeContracts: leaseMetrics.length,
      unitsOnHire: leaseMetrics.reduce((s, m) => s + m.activeUnits, 0),
      monthlyRevenueUsd: leaseMetrics.reduce((s, m) => s + m.monthlyRunRateUsd, 0),
      attention: leaseMetrics.filter((m) => m.needsAttention).length,
    },
    attention: {
      total: flags.filter((f) => f.any).length,
      csc: flags.filter((f) => f.csc.level !== "OK").length,
      repair: flags.filter((f) => f.needsRepair).length,
      idle: flags.filter((f) => f.storage.isIdleTooLong).length,
    },
    byRegion,
    byStatus,
  };
}
