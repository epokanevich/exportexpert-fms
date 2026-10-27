-- История ставок Per Diem (D-08). Каждому существующему договору — один период с даты On-Hire по его ставке,
-- поэтому начисления по уже существующим договорам не меняются.
CREATE TABLE "LeaseRatePeriod" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "dailyRateUsd" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaseRatePeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeaseRatePeriod_leaseId_effectiveFrom_key" ON "LeaseRatePeriod"("leaseId", "effectiveFrom");

ALTER TABLE "LeaseRatePeriod" ADD CONSTRAINT "LeaseRatePeriod_leaseId_fkey"
  FOREIGN KEY ("leaseId") REFERENCES "LeaseContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "LeaseRatePeriod" ("id", "leaseId", "effectiveFrom", "dailyRateUsd")
SELECT 'lrp_' || replace(gen_random_uuid()::text, '-', ''), l."id", l."startDate", l."dailyRateUsd"
FROM "LeaseContract" l;
