-- Деньги: DOUBLE PRECISION → numeric(12,2) (D-29). Значения округляются до цента явно (половина — от нуля),
-- поэтому накопленный шум вида 8.100000000000001 превращается в 8.10. Данные не удаляются.

-- Индекс из исправления D-15 мог не попасть в базу, созданную через `db push` до этого исправления.
CREATE INDEX IF NOT EXISTS "OneWayTrip_containerId_idx" ON "OneWayTrip"("containerId");

ALTER TABLE "Container"
  ALTER COLUMN "eorAmountUsd" SET DATA TYPE DECIMAL(12,2) USING round("eorAmountUsd"::numeric, 2),
  ALTER COLUMN "storageRatePerDayUsd" SET DATA TYPE DECIMAL(12,2) USING round("storageRatePerDayUsd"::numeric, 2),
  ALTER COLUMN "purchasePriceUsd" SET DATA TYPE DECIMAL(12,2) USING round("purchasePriceUsd"::numeric, 2),
  ALTER COLUMN "currentBookValueUsd" SET DATA TYPE DECIMAL(12,2) USING round("currentBookValueUsd"::numeric, 2),
  ALTER COLUMN "totalRevenueUsd" SET DATA TYPE DECIMAL(12,2) USING round("totalRevenueUsd"::numeric, 2),
  ALTER COLUMN "totalRepairCostUsd" SET DATA TYPE DECIMAL(12,2) USING round("totalRepairCostUsd"::numeric, 2);

ALTER TABLE "ContainerEvent"
  ALTER COLUMN "amountUsd" SET DATA TYPE DECIMAL(12,2) USING round("amountUsd"::numeric, 2);

ALTER TABLE "LeaseContract"
  ALTER COLUMN "dailyRateUsd" SET DATA TYPE DECIMAL(12,2) USING round("dailyRateUsd"::numeric, 2),
  ALTER COLUMN "depositUsd" SET DATA TYPE DECIMAL(12,2) USING round("depositUsd"::numeric, 2);

ALTER TABLE "OneWayTrip"
  ALTER COLUMN "feeUsd" SET DATA TYPE DECIMAL(12,2) USING round("feeUsd"::numeric, 2),
  ALTER COLUMN "detentionRatePerDayUsd" SET DATA TYPE DECIMAL(12,2) USING round("detentionRatePerDayUsd"::numeric, 2),
  ALTER COLUMN "returnEorUsd" SET DATA TYPE DECIMAL(12,2) USING round("returnEorUsd"::numeric, 2);
