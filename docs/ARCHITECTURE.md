# FMS «Экспортэксперт» — архитектура

Fleet Management System для парка собственных контейнеров (SOC): реестр, One-Way, долгосрочная аренда,
терминальный инспектор, дашборд, аудит.

## 1. Стек

| Слой | Технология | Почему |
|---|---|---|
| Фреймворк | Next.js 16 (App Router), React 19, TypeScript 5 strict | Server Components + Server Actions = CRUD без отдельного API |
| UI | Tailwind CSS 4, свои компоненты (`src/components/ui`), Lucide, Recharts | Полный контроль над адаптивом и доступностью |
| Данные | Prisma 6 + PostgreSQL (Neon) | Миграции, транзакции, частичные индексы, CHECK, pg_trgm |
| Валидация | Zod 4 (`src/lib/zod-setup.ts`: русская локаль, `jitless` для строгой CSP) | Ничего не пишется в БД без схемы |
| Авторизация | JWT HS256 (`jose`) в httpOnly-cookie + `bcryptjs`, версия сессии в БД | Отзыв сессий без серверного стора |
| Тесты | Vitest: unit (`npm test`) и интеграционные на PostgreSQL (`npm run test:int`) | Деньги, гонки и ограничения проверяются на настоящей БД |

## 2. Слои

```
src/
  proxy.ts                ← гард маршрутов (подпись JWT) + CSP с nonce на каждый запрос
  app/
    login/, auth/signout/ ← вход; выход по отозванной сессии (удаляет cookie без цикла редиректов)
    (app)/                ← защищённая зона: layout проверяет сессию по БД и активирует договоры с наступившим On-Hire
      page.tsx            ← дашборд
      containers/         ← реестр (серверный поиск + пагинация) и профиль [id]
      one-way/, leases/   ← операции
      inspector/          ← терминальный инспектор (mobile-first)
      profile/, admin/    ← смена пароля; пользователи, роли, аудит-журнал (ADMIN)
    api/attachments/      ← загрузка/выдача вложений (только по сессии)
    api/export/registry/  ← CSV всей выборки реестра
    print/one-way/[id]/   ← Release Order (A4)
  actions/                ← Server Actions: authorize() → Zod → транзакция (захват условием + audit())
  lib/
    domain/               ← чистые функции: статусы, детеншн, аренда по периодам, KPI, повреждения CEDEX
    money.ts              ← деньги в центах, единое округление
    business-time.ts      ← «сегодня» компании (BUSINESS_TIMEZONE)
    queries/              ← чтение: реестр (raw SQL, параметризованный), операции
    auth/                 ← сессия, DAL, права, политика паролей, лимит входа
    attachments/          ← проверка файлов, абстракция хранилища (local | db)
    audit.ts, db-errors.ts, lease-activation.ts
prisma/migrations/        ← история схемы (0_init = baseline базы из db push)
scripts/                  ← migrate-deploy.ts (baseline + deploy), preflight-prod.sql, generate-load-fleet.ts
```

Правило: страницы читают БД и передают в клиентские компоненты сериализуемые DTO; все расчёты статусов и денег —
в `lib/domain` и `lib/money`, одна точка истины для UI, CSV, дашборда и экшенов.

## 3. Модель данных

- **User** — email, bcrypt-хэш, роль (по умолчанию INSPECTOR — наименее привилегированная), `tokenVersion`, `passwordChangedAt`.
- **Container** — паспорт (ISO 6346, типоразмер, массы), техсостояние (грейд, техстатус, EOR, срок КБК, № таблички CSC,
  программа ACEP/PES), собственник (`ownershipType` OWNED / LEASED_IN / MANAGED, `ownerName`, `lessorName`),
  дислокация, экономика; `deletedAt` — мягкое списание.
- **ContainerEvent** — журнал (14 типов + WRITE_OFF); к событию — **DamageItem** (строки CEDEX) и **Attachment**.
- **OneWayTrip** — выдача A → B: free days, **последний бесплатный день** (`deadlineDate`, хранится), ставка детеншна, результат приёмки.
- **LeaseContract** + **LeaseItem** + **LeaseRatePeriod** — договор, единицы с On-Hire/Off-Hire, история ставок Per Diem.
- **AuditLog** — кто (`userId`, имя), когда, что (`action`, сущность, сводка, детали JSON).
- **LoginAttempt** — счётчики неудачных входов (ключи `ip|email` и `ip|*`).
- **AttachmentBlob** — содержимое вложений для драйвера `db`.

### Деньги

Все суммы — `numeric(12,2)`. Prisma-клиент (`src/lib/prisma.ts`, result extension) отдаёт их как число долларов
(`fromDbMoney`), поэтому в UI не уходят объекты Decimal. Вся арифметика — в целых центах (`mulRate`, `sumMoney`,
`roundMoney` в `src/lib/money.ts`; шум двоичной арифметики снимается через 15 значащих цифр), запись — строкой `toDbMoney()`.
3 × $0,10 × 27 сут = ровно $8,10.

### История ставок аренды

Ставка действует с `effectiveFrom` до начала следующего периода. Продление с новой ставкой создаёт период с даты
не раньше «сегодня» — уже начисленные дни не пересчитываются. `accrueItem()` режет интервал аренды по периодам;
калькулятор, Off-Hire, «за срок», CSV и дашборд используют одну функцию. `LeaseContract.dailyRateUsd` — действующая ставка.

### Статусы

- Контейнер: AVAILABLE, ONE_WAY, LONG_TERM_LEASE, RESERVED (резерв под договор с будущим On-Hire), IN_TRANSIT,
  MAINTENANCE, WRITTEN_OFF. Последние четыре «операционные» статусы назначаются только операциями.
- Договор: SCHEDULED → ACTIVE (ленивая активация `activateDueLeases()` при рендере защищённой зоны, идемпотентна) → COMPLETED.
- Вычисляемые: One-Way OVERDUE (ACTIVE и сегодня > последнего бесплатного дня), «горящий» (≤ 5 дн.), КБК EXPIRED/EXPIRING,
  простой > 30 дн., договор истекает ≤ 14/30 дн.

### Ограничения БД (живут в миграциях — Prisma не описывает их в schema.prisma)

- Частичные уникальные индексы: одна ACTIVE-поездка One-Way и одна открытая строка аренды на контейнер.
- CHECK: допустимые статусы, роли, типы событий, коды CEDEX; неотрицательные суммы; даты (`endDate > startDate`,
  возврат не раньше выдачи); согласованность «Списан» ⇔ `deletedAt`.
- `ON DELETE RESTRICT` на журнале, рейсах, договорах, повреждениях и вложениях — история не удаляется каскадом.
- GIN-индекс `pg_trgm` по номеру — поиск по подстроке на тысячах единиц.

Нарушения переводятся в русские сообщения (`src/lib/db-errors.ts`), а не в 500.

## 4. Операции и конкурентный доступ

Каждый экшен: `authorize(permission)` (сессия + версия + роль из БД) → Zod → транзакция. Состояние «захватывается»
условным `updateMany` (например, контейнер только `WHERE operationalStatus = 'AVAILABLE'`); `count = 0` → `ConflictError`
с понятным текстом. Off-Hire и продление дополнительно блокируют строку договора (`SELECT … FOR UPDATE`), чтобы
последний возврат гарантированно закрыл договор. Внутри той же транзакции пишется `audit()`.

| Операция | Эффект |
|---|---|
| Выдать в One-Way | trip ACTIVE, контейнер ONE_WAY, событие ONE_WAY_OUT, fee → выручка |
| Gate-In по One-Way | trip COMPLETED/DISPUTE, детеншн → выручка, техстатус/EOR по акту |
| Новый договор | ACTIVE (On-Hire сегодня или раньше) или SCHEDULED + контейнеры RESERVED |
| Продлить | `endDate` += N мес.; новая ставка → новый период |
| Off-Hire | аренда по периодам → выручка; договор закрывается, когда возвращены все |
| Акт осмотра | грейд, техстатус, строки CEDEX, EOR = сумма строк; закрытие ремонта — EOR в затраты, строки REPAIRED |
| Списать (ADMIN) | WRITTEN_OFF + `deletedAt` + причина в журнале |

## 5. Безопасность

- **Сессии (D-10):** в JWT — `tokenVersion`; `getSession()` сверяет её с БД на каждом запросе. Выход, смена роли и пароля
  увеличивают версию — старые токены дают редирект на `/auth/signout` (страницы) или 401 (API).
- **Лимит входа (D-09):** таблица `LoginAttempt`; попытка засчитывается атомарно (`INSERT … ON CONFLICT … RETURNING`)
  до проверки пароля. 5 ошибок / 15 мин на `ip|email`, 30 / 15 мин на IP; успешный вход возвращает попытку в бюджет IP.
  IP — от доверенного прокси (`TRUSTED_PROXY_HOPS`).
- **CSP (D-25):** `script-src 'self' 'nonce-…' 'strict-dynamic'` без `unsafe-inline`/`unsafe-eval`; `style-src 'unsafe-inline'`
  оставлен для style-атрибутов (прогресс-бары, Recharts) и `<style>` sonner; `frame-ancestors 'none'`, `object-src 'none'`,
  HSTS в production. Маршруты `/api/*` ставят собственную CSP (вложения — `sandbox`).
- **Пароли:** bcrypt cost 12, политика ≥ 10 символов, не email, не текущий, не опубликованный демо-пароль.
- **Демо-режим** выключен по умолчанию (`DEMO_MODE=true` — явное включение).

## 6. Вложения

Абстракция `AttachmentStorage` (`put/get/delete` по сгенерированному ключу `att_<uuid>` — пути из ввода не используются):

- `local` — каталог вне `public` (`ATTACHMENTS_DIR`), для разработки;
- `db` — таблица `AttachmentBlob` в PostgreSQL, по умолчанию в production: файлы ≤ 5 МБ переживают передеплой Render
  и бэкапятся вместе с базой.

Тип файла определяется по сигнатуре (PNG/JPEG/PDF), имя очищается; выдача только по сессии, PDF — скачиванием,
`X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`. **Не сделано:** драйвер S3-совместимого хранилища /
Vercel Blob (private) — реализуется тем же интерфейсом; превью-миниатюры; антивирусная проверка.

## 7. Время

Даты-«дни» хранятся полночью UTC. «Сегодня» компании — `businessToday()` по `BUSINESS_TIMEZONE` (по умолчанию Europe/Moscow):
просрочки, начисления, дата дашборда, дата постановки на сток. Дата операции не может быть позже текущей даты во Владивостоке
(`latestBusinessDate`, D-06). Время событий выводится в бизнес-поясе.

## 8. Развёртывание

`render-build` / `vercel-build` = `prisma generate → scripts/migrate-deploy.ts → prisma/bootstrap.ts → next build`.
`migrate-deploy.ts` делает baseline `0_init` для базы из `db push`, затем `prisma migrate deploy`. Bootstrap работает только
с пустой базой. Пошагово — [DEPLOY.md](DEPLOY.md).
