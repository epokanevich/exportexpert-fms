-- Целостность на уровне БД (1.4, 1.5). Prisma не описывает частичные индексы и CHECK в schema.prisma,
-- поэтому они живут только в миграциях (см. docs/ARCHITECTURE.md, «Ограничения БД»).

-- 1.4. Одна активная операция на контейнер — инвариант держится даже при гонке параллельных запросов.
CREATE UNIQUE INDEX "OneWayTrip_one_active_per_container" ON "OneWayTrip"("containerId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "LeaseItem_one_open_per_container" ON "LeaseItem"("containerId") WHERE "offHireDate" IS NULL;

-- 1.5. Допустимые значения статусов (перечисления хранятся строками).
ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK ("role" IN ('ADMIN', 'MANAGER', 'INSPECTOR'));

ALTER TABLE "Container"
  ADD CONSTRAINT "Container_sizeType_check" CHECK ("sizeType" IN ('20DC', '20HQ', '40DC', '40HC', '40HR', '20OT', '40FR')),
  ADD CONSTRAINT "Container_conditionGrade_check" CHECK ("conditionGrade" IN ('IICL6', 'CW', 'WWT', 'DAMAGED')),
  ADD CONSTRAINT "Container_techStatus_check" CHECK ("techStatus" IN ('SOUND', 'DAMAGED', 'IN_REPAIR', 'HOLD')),
  ADD CONSTRAINT "Container_operationalStatus_check"
    CHECK ("operationalStatus" IN ('AVAILABLE', 'ONE_WAY', 'LONG_TERM_LEASE', 'RESERVED', 'IN_TRANSIT', 'MAINTENANCE', 'WRITTEN_OFF')),
  ADD CONSTRAINT "Container_writeoff_consistency_check" CHECK (("operationalStatus" = 'WRITTEN_OFF') = ("deletedAt" IS NOT NULL)),
  ADD CONSTRAINT "Container_money_nonnegative_check" CHECK (
    "purchasePriceUsd" >= 0 AND "currentBookValueUsd" >= 0 AND "totalRevenueUsd" >= 0 AND "totalRepairCostUsd" >= 0
    AND coalesce("eorAmountUsd", 0) >= 0 AND coalesce("storageRatePerDayUsd", 0) >= 0),
  ADD CONSTRAINT "Container_weights_check" CHECK ("tareWeightKg" > 0 AND "maxGrossWeightKg" > "tareWeightKg" AND "maxPayloadKg" >= 0);

ALTER TABLE "ContainerEvent"
  ADD CONSTRAINT "ContainerEvent_type_check" CHECK ("type" IN (
    'PURCHASE', 'GATE_IN', 'GATE_OUT', 'ONE_WAY_OUT', 'ONE_WAY_IN', 'LEASE_ON_HIRE', 'LEASE_OFF_HIRE', 'LEASE_EXTENDED',
    'INSPECTION', 'REPAIR_START', 'REPAIR_DONE', 'STATUS_CHANGE', 'CSC_RENEWAL', 'WRITE_OFF')),
  ADD CONSTRAINT "ContainerEvent_amount_nonnegative_check" CHECK (coalesce("amountUsd", 0) >= 0);

ALTER TABLE "OneWayTrip"
  ADD CONSTRAINT "OneWayTrip_status_check" CHECK ("status" IN ('ACTIVE', 'COMPLETED', 'DISPUTE')),
  ADD CONSTRAINT "OneWayTrip_returnCondition_check" CHECK ("returnCondition" IS NULL OR "returnCondition" IN ('SOUND', 'DAMAGED')),
  ADD CONSTRAINT "OneWayTrip_money_nonnegative_check" CHECK ("feeUsd" >= 0 AND "detentionRatePerDayUsd" >= 0 AND coalesce("returnEorUsd", 0) >= 0),
  ADD CONSTRAINT "OneWayTrip_freeDays_check" CHECK ("freeDays" BETWEEN 0 AND 365),
  ADD CONSTRAINT "OneWayTrip_dates_check" CHECK ("deadlineDate" >= "handoverDate" AND ("actualReturnDate" IS NULL OR "actualReturnDate" >= date_trunc('day', "handoverDate")));

ALTER TABLE "LeaseContract"
  ADD CONSTRAINT "LeaseContract_status_check" CHECK ("status" IN ('SCHEDULED', 'ACTIVE', 'COMPLETED')),
  ADD CONSTRAINT "LeaseContract_paymentStatus_check" CHECK ("paymentStatus" IN ('PAID', 'PENDING', 'OVERDUE')),
  ADD CONSTRAINT "LeaseContract_surveys_check" CHECK (
    "onHireSurvey" IN ('NOT_STARTED', 'PENDING', 'SIGNED') AND "offHireSurvey" IN ('NOT_STARTED', 'PENDING', 'SIGNED')),
  ADD CONSTRAINT "LeaseContract_money_check" CHECK ("dailyRateUsd" > 0 AND "depositUsd" >= 0),
  ADD CONSTRAINT "LeaseContract_dates_check" CHECK ("endDate" > "startDate");

ALTER TABLE "LeaseRatePeriod" ADD CONSTRAINT "LeaseRatePeriod_rate_check" CHECK ("dailyRateUsd" > 0);

ALTER TABLE "LeaseItem" ADD CONSTRAINT "LeaseItem_dates_check" CHECK ("offHireDate" IS NULL OR "offHireDate" >= "onHireDate");
