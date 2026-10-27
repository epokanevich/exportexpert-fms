import { PrismaClient } from "@prisma/client";
import { fromDbMoney } from "@/lib/money";

/**
 * Денежные колонки в БД — numeric(12,2). На чтении Decimal превращается в число долларов (fromDbMoney):
 * значения с двумя знаками читаются без потерь, а в клиентские компоненты не уходят объекты Decimal.
 * Вся арифметика — в центах (src/lib/money.ts), запись — строкой toDbMoney().
 */
function money<K extends string>(field: K) {
  return { needs: { [field]: true } as Record<K, true>, compute: (row: Record<K, unknown>) => fromDbMoney(row[field] as string) };
}
function optionalMoney<K extends string>(field: K) {
  return {
    needs: { [field]: true } as Record<K, true>,
    compute: (row: Record<K, unknown>) => (row[field] === null ? null : fromDbMoney(row[field] as string)),
  };
}

export function createPrismaClient() {
  return new PrismaClient().$extends({
    result: {
      container: {
        eorAmountUsd: optionalMoney("eorAmountUsd"),
        storageRatePerDayUsd: optionalMoney("storageRatePerDayUsd"),
        purchasePriceUsd: money("purchasePriceUsd"),
        currentBookValueUsd: money("currentBookValueUsd"),
        totalRevenueUsd: money("totalRevenueUsd"),
        totalRepairCostUsd: money("totalRepairCostUsd"),
      },
      containerEvent: { amountUsd: optionalMoney("amountUsd") },
      oneWayTrip: {
        feeUsd: money("feeUsd"),
        detentionRatePerDayUsd: money("detentionRatePerDayUsd"),
        returnEorUsd: optionalMoney("returnEorUsd"),
      },
      leaseContract: { dailyRateUsd: money("dailyRateUsd"), depositUsd: money("depositUsd") },
      leaseRatePeriod: { dailyRateUsd: money("dailyRateUsd") },
      damageItem: { costUsd: optionalMoney("costUsd") },
    },
  });
}

export type AppPrismaClient = ReturnType<typeof createPrismaClient>;
export type AppTransaction = Parameters<Parameters<AppPrismaClient["$transaction"]>[0]>[0];

const globalForPrisma = globalThis as unknown as { prisma?: AppPrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
