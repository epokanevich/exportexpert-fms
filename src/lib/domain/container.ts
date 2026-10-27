import { diffDays } from "@/lib/dates";
import { mulRate, roundMoney, sumMoney } from "@/lib/money";
import { TECH_STATUS_LABELS, TECH_STATUSES, THRESHOLDS, isOneOf } from "./constants";

export type CscLevel = "EXPIRED" | "EXPIRING" | "OK";

export interface CscState {
  level: CscLevel;
  daysLeft: number;
}

export function cscStateOf(cscPlateExpiry: Date, now: Date): CscState {
  const daysLeft = diffDays(now, cscPlateExpiry);
  if (daysLeft < 0) return { level: "EXPIRED", daysLeft };
  if (daysLeft <= THRESHOLDS.cscWarningDays) return { level: "EXPIRING", daysLeft };
  return { level: "OK", daysLeft };
}

export interface IssueCandidateInput {
  operationalStatus: string;
  techStatus: string;
  cscPlateExpiry: Date;
}

/**
 * Почему контейнер нельзя выдать (One-Way, аренда, собственный рейс). null — выдача разрешена.
 * Единая точка истины для форм и серверных проверок.
 */
export function issueBlockReason(c: IssueCandidateInput, now: Date): string | null {
  if (c.operationalStatus !== "AVAILABLE") return "Контейнер не на стоке";
  if (c.techStatus !== "SOUND") {
    const label = isOneOf(TECH_STATUSES, c.techStatus) ? TECH_STATUS_LABELS[c.techStatus] : c.techStatus;
    return `Тех. статус «${label}»`;
  }
  const csc = cscStateOf(c.cscPlateExpiry, now);
  if (csc.level === "EXPIRED") return `КБК (CSC) просрочена на ${-csc.daysLeft} дн.`;
  return null;
}

export interface StorageInput {
  operationalStatus: string;
  storageStartDate: Date | null;
  storageRatePerDayUsd: number | null;
}

export interface StorageState {
  /** Дней на стоке (null — контейнер не на стоке). */
  idleDays: number | null;
  isIdleTooLong: boolean;
  /** Накопленная стоимость хранения, USD. */
  storageCostUsd: number;
}

export function storageStateOf(container: StorageInput, now: Date): StorageState {
  const onStock = container.operationalStatus === "AVAILABLE" && container.storageStartDate !== null;
  if (!onStock || !container.storageStartDate) {
    return { idleDays: null, isIdleTooLong: false, storageCostUsd: 0 };
  }
  const idleDays = Math.max(0, diffDays(container.storageStartDate, now));
  return {
    idleDays,
    isIdleTooLong: idleDays > THRESHOLDS.idleStockDays,
    storageCostUsd: mulRate(container.storageRatePerDayUsd ?? 0, idleDays),
  };
}

export interface EconomicsInput {
  purchasePriceUsd: number;
  currentBookValueUsd: number;
  totalRevenueUsd: number;
  totalRepairCostUsd: number;
}

export interface UnitEconomics {
  depreciationUsd: number;
  /** Выручка − ремонты − амортизация. */
  netResultUsd: number;
  /** netResult / цена покупки. */
  roi: number;
  /** Окупаемость: доля цены покупки, покрытая чистой выручкой (выручка − ремонты). */
  paybackRatio: number;
}

export function unitEconomicsOf(c: EconomicsInput): UnitEconomics {
  const depreciationUsd = Math.max(0, sumMoney([c.purchasePriceUsd, -c.currentBookValueUsd]));
  const netResultUsd = sumMoney([c.totalRevenueUsd, -c.totalRepairCostUsd, -depreciationUsd]);
  const roi = c.purchasePriceUsd > 0 ? netResultUsd / c.purchasePriceUsd : 0;
  const paybackRatio = c.purchasePriceUsd > 0 ? roundMoney(c.totalRevenueUsd - c.totalRepairCostUsd) / c.purchasePriceUsd : 0;
  return { depreciationUsd, netResultUsd, roi, paybackRatio };
}

export interface AttentionInput extends StorageInput {
  techStatus: string;
  cscPlateExpiry: Date;
}

export interface AttentionFlags {
  csc: CscState;
  storage: StorageState;
  needsRepair: boolean;
  any: boolean;
}

export function attentionFlagsOf(c: AttentionInput, now: Date): AttentionFlags {
  const csc = cscStateOf(c.cscPlateExpiry, now);
  const storage = storageStateOf(c, now);
  const needsRepair = c.techStatus === "DAMAGED" || c.techStatus === "IN_REPAIR";
  return { csc, storage, needsRepair, any: csc.level !== "OK" || storage.isIdleTooLong || needsRepair };
}
