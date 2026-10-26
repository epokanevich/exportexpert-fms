# FMS «Экспортэксперт» — архитектурный план

Fleet Management System для парка собственных контейнеров (SOC). MVP промышленного уровня:
реестр парка, контроль One-Way, долгосрочная аренда, терминальный инспектор, дашборд руководителя.

## 1. Стек

| Слой | Технология | Почему |
|---|---|---|
| Фреймворк | Next.js 16 (App Router), React 19, TypeScript 5 (strict) | Server Components + Server Actions = CRUD без отдельного API |
| UI | Tailwind CSS 4, компоненты в стиле shadcn/ui (свои, в `src/components/ui`), Lucide, Recharts | Без тяжёлых UI-китов, полный контроль над адаптивом |
| Данные | Prisma 6 + PostgreSQL (Neon) | Serverless-friendly облачный Postgres; схема совместима и с SQLite для офлайн-демо |
| Валидация | Zod 4 на границе (Server Actions) | Ничего не пишется в БД без схемы |
| Авторизация | JWT (HS256, `jose`) в httpOnly-cookie + `bcryptjs` | Проверка в `proxy.ts` (edge-guard) и повторно в каждом Server Action |
| Тесты | Vitest — доменная логика (ISO 6346, детеншн, начисления аренды, KPI) | Самые дорогие ошибки — в расчётах |

## 2. Слои приложения

```
src/
  proxy.ts                  ← гард маршрутов: нет валидной сессии → /login
  app/
    login/                  ← вход + «Быстрый демо-вход в 1 клик»
    (app)/                  ← защищённая зона, общий AppShell
      page.tsx              ← Дашборд и аналитика парка
      containers/           ← Реестр (таблица/карточки) + профиль [id]
      one-way/              ← Контроль One-Way
      leases/               ← Долгосрочная аренда + договор [id]
      inspector/            ← Терминальный инспектор (mobile-first)
  actions/                  ← Server Actions (auth, containers, one-way, leases, inspector, demo)
  lib/
    domain/                 ← ЧИСТЫЕ функции без I/O: статусы, расчёты, KPI (покрыты тестами)
    iso6346.ts              ← расчёт/валидация контрольной цифры
    auth/                   ← JWT-сессия, requireSession()
    seed/                   ← генератор демо-данных (общий для CLI-сида и кнопки «Сбросить»)
  components/
    ui/                     ← Button, Badge, Card, Input, Select, Sheet …
    layout/                 ← Sidebar (ПК), MobileHeader + BottomNav (планшет/телефон)
    containers|one-way|leases|inspector|dashboard/
```

Правило: страницы (Server Components) читают БД через Prisma и передают в клиентские компоненты
уже сериализованные DTO; все вычисления статусов (остаток свободных дней, детеншн, начисления,
алерты КБК, простой на стоке) — в `lib/domain`, одна точка истины для UI, дашборда и бейджей.

## 3. Модель данных

- **User** — сотрудник (email, bcrypt-хэш, роль).
- **Container** — профиль единицы: паспорт (ISO 6346 `bicCode`, `sizeType`, `isoCode`, год, RAL, завод,
  тара/нагрузка/брутто), техсостояние (`conditionGrade`, `techStatus`, `cscPlateExpiry`, `eorAmountUsd`),
  дислокация (`operationalStatus`, `currentLocode`, `currentTerminal`, `storageStartDate`,
  `storageRatePerDayUsd`), экономика (покупка, остаточная стоимость, выручка, ремонты).
- **ContainerEvent** — журнал: GATE_IN, GATE_OUT, ONE_WAY_OUT/IN, LEASE_ON_HIRE/OFF_HIRE, INSPECTION,
  REPAIR_START/REPAIR_DONE, STATUS_CHANGE, PURCHASE, CSC_RENEWAL.
- **OneWayTrip** — выдача контейнера контрагенту A → B: free days, дедлайн (`handoverDate + freeDays`),
  ставка детеншна, фиксированный fee, результат приёмки.
- **LeaseContract** + **LeaseItem** — договор аренды и привязка контейнеров с датами On-Hire/Off-Hire
  по каждой единице (частичный возврат пакета, история аренды по контейнеру).

Перечисления хранятся строками (совместимо с PostgreSQL и SQLite) и типизируются TS-юнионами в `lib/domain/constants.ts`.
`allowedReturnLocodes` — CSV-строка (в PostgreSQL можно заменить на `String[]`).

### Производные статусы (не хранятся, считаются на лету)
- One-Way `OVERDUE` = `ACTIVE` и сегодня > `deadlineDate`; детеншн = дни просрочки × ставка.
- «Горящий» One-Way — до дедлайна ≤ 5 дней.
- КБК: `EXPIRED` (просрочена) / `EXPIRING` (< 30 дн.) / `OK`.
- Простой на стоке: `AVAILABLE` и > 30 дней с `storageStartDate`; накопленная стоимость хранения.
- Аренда: истекает ≤ 14 / ≤ 30 дн., начисления за текущий месяц и за весь срок
  (Σ по единицам: дни аренды × Per Diem).

## 4. Ключевые бизнес-операции (Server Actions, транзакции Prisma)

| Операция | Эффект |
|---|---|
| Выдать в One-Way | trip ACTIVE, контейнер `ONE_WAY`, событие ONE_WAY_OUT, fee → выручка |
| Gate-In по One-Way | trip COMPLETED (или DISPUTE при повреждении), контейнер `AVAILABLE` на депо назначения, техстатус/EOR по акту, детеншн → выручка, событие ONE_WAY_IN |
| Новый договор аренды | LeaseContract + LeaseItem, контейнеры `LONG_TERM_LEASE`, события ON_HIRE |
| Продлить договор | `endDate` += N мес., событие по каждой единице |
| Off-Hire | выбранные единицы возвращаются на депо из `allowedReturnLocodes`, договор закрывается, когда возвращены все |
| Инспекция / смена статуса | техстатус, грейд, EOR, КБК, локация + событие в журнале |
| Сброс демо-данных | очистка и повторный сид (даты относительно «сегодня» — сценарии всегда актуальны) |

## 5. UX и адаптив

- `lg` (≥1024px): фиксированный сайдбар, таблицы с мультифильтрами/сортировкой, Slide-over справа.
- `< lg` (телефон/планшет): верхний хедер + нижний таб-бар на 5 разделов, карточки вместо таблиц,
  Sheet-панели выезжают снизу, тап-зоны ≥ 44px.
- Номера контейнеров — моноширинный шрифт, формат `EXEX 402918-3`; поиск по подстроке игнорирует пробелы/дефисы.

## 6. Развёртывание

- БД — PostgreSQL (Neon, pooled-соединение, `sslmode=require`); `DATABASE_URL` и `AUTH_SECRET` — переменные окружения.
- Прод: Render Web Service — Build `npm install && npm run vercel-build`, Start `npm run start`
  (демо: https://exportexpert-fms.onrender.com). Альтернатива — Vercel с тем же скриптом.
- `vercel-build` = `prisma generate → prisma db push → prisma/bootstrap.ts → next build`;
  bootstrap заливает демо-данные только в пустую базу.
- Подробные инструкции — README, разделы «Деплой на Render» и «Деплой на Vercel».
