-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "bicCode" TEXT NOT NULL,
    "sizeType" TEXT NOT NULL,
    "isoCode" TEXT NOT NULL,
    "manufactureYear" INTEGER NOT NULL,
    "colorRal" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "tareWeightKg" INTEGER NOT NULL,
    "maxPayloadKg" INTEGER NOT NULL,
    "maxGrossWeightKg" INTEGER NOT NULL,
    "conditionGrade" TEXT NOT NULL,
    "techStatus" TEXT NOT NULL,
    "cscPlateExpiry" TIMESTAMP(3) NOT NULL,
    "eorAmountUsd" DOUBLE PRECISION,
    "operationalStatus" TEXT NOT NULL,
    "currentLocode" TEXT NOT NULL,
    "currentTerminal" TEXT NOT NULL,
    "storageStartDate" TIMESTAMP(3),
    "storageRatePerDayUsd" DOUBLE PRECISION,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "purchasePriceUsd" DOUBLE PRECISION NOT NULL,
    "currentBookValueUsd" DOUBLE PRECISION NOT NULL,
    "totalRevenueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRepairCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerEvent" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "locode" TEXT,
    "terminal" TEXT,
    "description" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneWayTrip" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "counterpartyName" TEXT NOT NULL,
    "counterpartyInn" TEXT,
    "counterpartyContact" TEXT,
    "bookingRef" TEXT NOT NULL,
    "pickupLocode" TEXT NOT NULL,
    "pickupTerminal" TEXT NOT NULL,
    "dropoffLocode" TEXT NOT NULL,
    "dropoffTerminal" TEXT NOT NULL,
    "handoverDate" TIMESTAMP(3) NOT NULL,
    "freeDays" INTEGER NOT NULL,
    "deadlineDate" TIMESTAMP(3) NOT NULL,
    "actualReturnDate" TIMESTAMP(3),
    "feeUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detentionRatePerDayUsd" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "returnCondition" TEXT,
    "returnEorUsd" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneWayTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseContract" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "lesseeName" TEXT NOT NULL,
    "lesseeInn" TEXT,
    "contactPerson" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "autoRenewal" BOOLEAN NOT NULL DEFAULT false,
    "dailyRateUsd" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "depositUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL,
    "allowedReturnLocodes" TEXT NOT NULL,
    "onHireSurvey" TEXT NOT NULL DEFAULT 'SIGNED',
    "offHireSurvey" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseItem" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "onHireDate" TIMESTAMP(3) NOT NULL,
    "offHireDate" TIMESTAMP(3),
    "returnLocode" TEXT,

    CONSTRAINT "LeaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Container_bicCode_key" ON "Container"("bicCode");

-- CreateIndex
CREATE INDEX "Container_operationalStatus_idx" ON "Container"("operationalStatus");

-- CreateIndex
CREATE INDEX "Container_currentLocode_idx" ON "Container"("currentLocode");

-- CreateIndex
CREATE INDEX "ContainerEvent_containerId_occurredAt_idx" ON "ContainerEvent"("containerId", "occurredAt");

-- CreateIndex
CREATE INDEX "OneWayTrip_status_idx" ON "OneWayTrip"("status");

-- CreateIndex
CREATE INDEX "OneWayTrip_containerId_idx" ON "OneWayTrip"("containerId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseContract_contractNumber_key" ON "LeaseContract"("contractNumber");

-- CreateIndex
CREATE INDEX "LeaseItem_leaseId_idx" ON "LeaseItem"("leaseId");

-- CreateIndex
CREATE INDEX "LeaseItem_containerId_idx" ON "LeaseItem"("containerId");

-- AddForeignKey
ALTER TABLE "ContainerEvent" ADD CONSTRAINT "ContainerEvent_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneWayTrip" ADD CONSTRAINT "OneWayTrip_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseItem" ADD CONSTRAINT "LeaseItem_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "LeaseContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseItem" ADD CONSTRAINT "LeaseItem_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

