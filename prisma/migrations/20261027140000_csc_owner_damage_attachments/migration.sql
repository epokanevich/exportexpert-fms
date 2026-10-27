-- 2.5: номер таблички CSC, ACEP, собственник/лизингодатель; строки повреждений CEDEX. 2.6: вложения к событиям.
-- Только новые колонки (с умолчаниями) и таблицы — существующие данные не меняются.
-- AlterTable
ALTER TABLE "Container" ADD COLUMN     "acepNumber" TEXT,
ADD COLUMN     "cscPlateNumber" TEXT,
ADD COLUMN     "lessorName" TEXT,
ADD COLUMN     "ownerName" TEXT NOT NULL DEFAULT 'ООО «Экспортэксперт»',
ADD COLUMN     "ownershipType" TEXT NOT NULL DEFAULT 'OWNED';
-- CreateTable
CREATE TABLE "DamageItem" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "locationCode" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "damageCode" TEXT NOT NULL,
    "repairCode" TEXT,
    "lengthCm" INTEGER,
    "widthCm" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "costUsd" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "repairedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DamageItem_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AttachmentBlob" (
    "storageKey" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttachmentBlob_pkey" PRIMARY KEY ("storageKey")
);
-- CreateIndex
CREATE INDEX "DamageItem_containerId_status_idx" ON "DamageItem"("containerId", "status");
-- CreateIndex
CREATE INDEX "DamageItem_eventId_idx" ON "DamageItem"("eventId");
-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
-- CreateIndex
CREATE INDEX "Attachment_eventId_idx" ON "Attachment"("eventId");
-- CreateIndex
CREATE INDEX "Attachment_containerId_idx" ON "Attachment"("containerId");
-- AddForeignKey
ALTER TABLE "DamageItem" ADD CONSTRAINT "DamageItem_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DamageItem" ADD CONSTRAINT "DamageItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ContainerEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ContainerEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Container"
  ADD CONSTRAINT "Container_ownershipType_check" CHECK ("ownershipType" IN ('OWNED', 'LEASED_IN', 'MANAGED')),
  ADD CONSTRAINT "Container_lessor_check" CHECK ("ownershipType" = 'OWNED' OR "lessorName" IS NOT NULL);

ALTER TABLE "DamageItem"
  ADD CONSTRAINT "DamageItem_codes_check" CHECK (
    "locationCode" ~ '^[A-Z][A-Z0-9]{3}$' AND "damageCode" ~ '^[A-Z]{2}$' AND ("repairCode" IS NULL OR "repairCode" ~ '^[A-Z]{2}$')),
  ADD CONSTRAINT "DamageItem_status_check" CHECK ("status" IN ('OPEN', 'REPAIRED')),
  ADD CONSTRAINT "DamageItem_numbers_check" CHECK (
    "quantity" > 0 AND coalesce("costUsd", 0) >= 0 AND coalesce("lengthCm", 0) >= 0 AND coalesce("widthCm", 0) >= 0);

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_mime_check" CHECK ("mimeType" IN ('image/png', 'image/jpeg', 'application/pdf')),
  ADD CONSTRAINT "Attachment_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 5242880);
