-- Pre-flight перед первым `migrate deploy` на боевой базе (только чтение, ничего не меняет).
-- Запуск: psql "$DATABASE_URL" -f scripts/preflight-prod.sql   (или SQL-редактор Neon).
-- Каждый запрос должен вернуть 0 строк / нули. Иначе миграции 2026102713*/14* откатятся и деплой остановится:
-- сначала исправьте перечисленные строки.

-- 0. Схема создана через db push и истории миграций нет → скрипт сделает baseline 0_init.
SELECT to_regclass('public."_prisma_migrations"') AS migrations_table, to_regclass('public."Container"') AS container_table;

-- 1. Деньги поместятся в numeric(12,2) (не больше 10 знаков до запятой, нет NaN/Infinity).
SELECT 'Container' AS t, id FROM "Container"
 WHERE abs("purchasePriceUsd") >= 1e10 OR abs("currentBookValueUsd") >= 1e10 OR abs("totalRevenueUsd") >= 1e10
    OR "purchasePriceUsd" = 'NaN' OR "totalRevenueUsd" = 'NaN';

-- 2. Одна активная операция на контейнер (частичные уникальные индексы).
SELECT 'OneWayTrip ACTIVE' AS t, "containerId", count(*) FROM "OneWayTrip" WHERE status = 'ACTIVE' GROUP BY "containerId" HAVING count(*) > 1;
SELECT 'LeaseItem open' AS t, "containerId", count(*) FROM "LeaseItem" WHERE "offHireDate" IS NULL GROUP BY "containerId" HAVING count(*) > 1;

-- 3. Значения статусов и ролей (CHECK).
SELECT 'User.role' AS t, id, role FROM "User" WHERE role NOT IN ('ADMIN', 'MANAGER', 'INSPECTOR');
SELECT 'Container status' AS t, id, "sizeType", "conditionGrade", "techStatus", "operationalStatus" FROM "Container"
 WHERE "sizeType" NOT IN ('20DC','20HQ','40DC','40HC','40HR','20OT','40FR')
    OR "conditionGrade" NOT IN ('IICL6','CW','WWT','DAMAGED')
    OR "techStatus" NOT IN ('SOUND','DAMAGED','IN_REPAIR','HOLD')
    OR "operationalStatus" NOT IN ('AVAILABLE','ONE_WAY','LONG_TERM_LEASE','IN_TRANSIT','MAINTENANCE');
SELECT 'ContainerEvent.type' AS t, id, type FROM "ContainerEvent"
 WHERE type NOT IN ('PURCHASE','GATE_IN','GATE_OUT','ONE_WAY_OUT','ONE_WAY_IN','LEASE_ON_HIRE','LEASE_OFF_HIRE','LEASE_EXTENDED',
                    'INSPECTION','REPAIR_START','REPAIR_DONE','STATUS_CHANGE','CSC_RENEWAL');
SELECT 'OneWayTrip' AS t, id FROM "OneWayTrip"
 WHERE status NOT IN ('ACTIVE','COMPLETED','DISPUTE') OR ("returnCondition" IS NOT NULL AND "returnCondition" NOT IN ('SOUND','DAMAGED'))
    OR "freeDays" NOT BETWEEN 0 AND 365;
SELECT 'LeaseContract' AS t, id FROM "LeaseContract"
 WHERE status NOT IN ('ACTIVE','COMPLETED') OR "paymentStatus" NOT IN ('PAID','PENDING','OVERDUE')
    OR "onHireSurvey" NOT IN ('NOT_STARTED','PENDING','SIGNED') OR "offHireSurvey" NOT IN ('NOT_STARTED','PENDING','SIGNED');

-- 4. Неотрицательные суммы, даты и массы (CHECK).
SELECT 'Container money/weights' AS t, id FROM "Container"
 WHERE "purchasePriceUsd" < 0 OR "currentBookValueUsd" < 0 OR "totalRevenueUsd" < 0 OR "totalRepairCostUsd" < 0
    OR coalesce("eorAmountUsd", 0) < 0 OR coalesce("storageRatePerDayUsd", 0) < 0
    OR NOT ("tareWeightKg" > 0 AND "maxGrossWeightKg" > "tareWeightKg" AND "maxPayloadKg" >= 0);
SELECT 'ContainerEvent amount' AS t, id FROM "ContainerEvent" WHERE coalesce("amountUsd", 0) < 0;
SELECT 'OneWayTrip money/dates' AS t, id FROM "OneWayTrip"
 WHERE "feeUsd" < 0 OR "detentionRatePerDayUsd" < 0 OR coalesce("returnEorUsd", 0) < 0
    OR NOT ("deadlineDate" >= "handoverDate" AND ("actualReturnDate" IS NULL OR "actualReturnDate" >= date_trunc('day', "handoverDate")));
SELECT 'LeaseContract money/dates' AS t, id FROM "LeaseContract" WHERE NOT ("dailyRateUsd" > 0 AND "depositUsd" >= 0 AND "endDate" > "startDate");
SELECT 'LeaseItem dates' AS t, id FROM "LeaseItem" WHERE "offHireDate" IS NOT NULL AND "offHireDate" < "onHireDate";

-- 5. Размер таблиц (ALTER TYPE переписывает таблицы под эксклюзивной блокировкой — на тысячах строк это секунды).
SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE relname IN ('Container','ContainerEvent','OneWayTrip','LeaseContract','LeaseItem') ORDER BY 1;

-- 6. Права на расширение pg_trgm (миграция 20261027160000). На Neon владелец базы может CREATE EXTENSION.
SELECT name, installed_version FROM pg_available_extensions WHERE name = 'pg_trgm';
