-- Мягкое удаление контейнера вместо каскада: «Списать» = статус WRITTEN_OFF + deletedAt.
-- ON DELETE CASCADE на журнале, рейсах и договорах заменён на RESTRICT — физическое удаление единицы
-- с историей теперь невозможно на уровне БД. Данные не меняются.
ALTER TABLE "Container" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Container_deletedAt_idx" ON "Container"("deletedAt");

ALTER TABLE "ContainerEvent" DROP CONSTRAINT "ContainerEvent_containerId_fkey";
ALTER TABLE "ContainerEvent" ADD CONSTRAINT "ContainerEvent_containerId_fkey"
  FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OneWayTrip" DROP CONSTRAINT "OneWayTrip_containerId_fkey";
ALTER TABLE "OneWayTrip" ADD CONSTRAINT "OneWayTrip_containerId_fkey"
  FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LeaseItem" DROP CONSTRAINT "LeaseItem_leaseId_fkey";
ALTER TABLE "LeaseItem" ADD CONSTRAINT "LeaseItem_leaseId_fkey"
  FOREIGN KEY ("leaseId") REFERENCES "LeaseContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LeaseItem" DROP CONSTRAINT "LeaseItem_containerId_fkey";
ALTER TABLE "LeaseItem" ADD CONSTRAINT "LeaseItem_containerId_fkey"
  FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Роль по умолчанию — наименее привилегированная (D-30).
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'INSPECTOR';
