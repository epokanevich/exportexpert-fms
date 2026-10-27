# Деплой на Render — пошагово

Прод: Render Web Service + PostgreSQL в Neon. Эта версия впервые переводит базу с `prisma db push` на миграции
и меняет денежные колонки на `numeric(12,2)`. Выкатка выполняется один раз по шагам ниже.

## 0. Что изменится в базе

| Миграция | Что делает | Данные |
|---|---|---|
| `0_init` | схема, как её создавал `db push` | baseline: отмечается применённой, SQL не выполняется |
| `…100000_money_numeric` | Float → `numeric(12,2)` с `round(…, 2)` | значения сохраняются, «шум» float округляется до цента |
| `…110000_lease_rate_periods` | история ставок; каждому договору — период с даты On-Hire | начисления не меняются |
| `…120000_soft_delete_restrict` | `deletedAt`, CASCADE → RESTRICT, роль по умолчанию INSPECTOR | без изменений |
| `…130000_integrity_constraints` | частичные уникальные индексы, CHECK на статусы и суммы | падает, если данные нарушают правила (см. шаг 1) |
| `…140000_csc_owner_damage_attachments` | CSC/ACEP, собственник, повреждения CEDEX, вложения | новые колонки с умолчаниями |
| `…150000_sessions_rate_limit_audit` | `tokenVersion`, `LoginAttempt`, `AuditLog` | все текущие сессии потребуют повторного входа |
| `…160000_bic_trigram_search` | `pg_trgm` + GIN-индекс по номеру | без изменений |

Проверено на копии демо-данных: суммы выручки, детеншна, Per Diem, ремонтов, остаточной стоимости до и после миграций
совпадают до цента; повторный запуск — «No pending migrations».

## 1. Pre-flight (только чтение)

1. Neon → **Branches → Create branch** от `main` (мгновенный снимок для отката).
2. Neon → **SQL Editor** → вставить содержимое [`scripts/preflight-prod.sql`](../scripts/preflight-prod.sql) → Run.
   Каждый блок «проверок» должен вернуть **0 строк**. Если есть строки — исправьте их до деплоя (или пришлите вывод).

## 2. Переменные окружения (Render → сервис → Environment)

| Переменная | Демо-стенд | Боевой стенд |
|---|---|---|
| `DATABASE_URL` | без изменений | строка Neon (pooled, `sslmode=require`) |
| `AUTH_SECRET` | без изменений | ≥ 32 случайных символов |
| `DEMO_MODE` | **`true` — добавить до деплоя**, иначе стенд станет боевым | не задавать |
| `ADMIN_INITIAL_PASSWORD` | не нужен (база не пустая) | нужен только для пустой базы |
| `BUSINESS_TIMEZONE` | по желанию (`Europe/Moscow`) | по желанию |
| `ATTACHMENTS_DRIVER` | по умолчанию `db` | по умолчанию `db` (диск Render эфемерный) |
| `TRUSTED_PROXY_HOPS` | `1` (по умолчанию) | `1` |

## 3. Build / Start

Render → Settings:

- **Build Command:** `npm install && npm run render-build`
- **Start Command:** `npm run start`

## 4. Выкатка

1. Запушить ветку `main` (или **Manual Deploy → Deploy latest commit**).
2. В логе сборки ожидается:
   - `ℹ База создана через db push: отмечаю 0_init применённой (baseline)…`
   - `Applying migration …` × 7 и `All migrations have been successfully applied.`
   - `✔ Bootstrap: База уже заполнена … — пропускаю.`
3. После старта: войти, открыть дашборд, реестр, One-Way, аренду; **Пользователи и аудит** — записи входа.

## 5. Если миграция упала

Миграции транзакционные: упавшая откатывается целиком, данные не меняются, но Prisma помечает её как failed.

1. Посмотреть причину в логе (`violates check constraint …` — какие строки нарушают правило).
2. Исправить данные (или откатиться на ветку-снимок из шага 1).
3. `npx prisma migrate resolve --rolled-back <имя_миграции>` с `DATABASE_URL` боевой базы, затем повторить деплой.

## 6. Откат

Код — Render → Deploys → предыдущий деплой → **Rollback**. База — Neon → Branches → восстановить из снимка шага 1
(новые колонки старой версией кода игнорируются, но `numeric` вместо Float старый код читает как `Decimal` —
поэтому откат кода без отката базы не поддерживается).
