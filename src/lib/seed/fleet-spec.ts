/**
 * Описание демо-парка. Все даты заданы смещением в днях от «сегодня»,
 * поэтому сценарии (просрочки, горящие дедлайны, истекающие договоры) актуальны при любом запуске.
 */
import type { ConditionGrade, OperationalStatus, SizeType, TechStatus } from "@/lib/domain/constants";

export interface ContainerSpec {
  key: string;
  prefix: string;
  serial: string;
  size: SizeType;
  year: number;
  maker: string;
  grade: ConditionGrade;
  tech: TechStatus;
  /** Смещение срока КБК относительно сегодня, дней. */
  cscDays: number;
  eor?: number;
  op: OperationalStatus;
  locode: string;
  terminal: string;
  /** Начало текущего состояния (дней назад): постановка на сток, выдача, On-Hire, начало ремонта. */
  sinceDays: number;
  storageRate?: number;
  /** Сколько завершённых One-Way циклов сгенерировать в истории. */
  pastCycles: number;
  notes?: string;
}

export const MAKERS = {
  cimc: "CIMC Qingdao",
  singamas: "Singamas Ningbo",
  dfic: "Dong Fang International (DFIC)",
  cxic: "CXIC Changzhou",
  abakan: "Абаканвагонмаш",
  mci: "Maersk Container Industry, Qingdao",
} as const;

export const CONTAINERS: readonly ContainerSpec[] = [
  // ── Активные One-Way (8) ────────────────────────────────────────────────
  { key: "OW1", prefix: "EXPU", serial: "402918", size: "40HC", year: 2021, maker: MAKERS.cimc, grade: "CW", tech: "SOUND", cscDays: 410, op: "ONE_WAY", locode: "CNSHA", terminal: "Shanghai SIPG", sinceDays: 52, pastCycles: 2 },
  { key: "OW2", prefix: "FESU", serial: "518204", size: "40HC", year: 2020, maker: MAKERS.singamas, grade: "CW", tech: "SOUND", cscDays: 230, op: "ONE_WAY", locode: "CNNGB", terminal: "Ningbo Beilun", sinceDays: 40, pastCycles: 3 },
  { key: "OW3", prefix: "TKRU", serial: "204812", size: "20DC", year: 2019, maker: MAKERS.dfic, grade: "CW", tech: "SOUND", cscDays: 515, op: "ONE_WAY", locode: "RUVVO", terminal: "ВМТП", sinceDays: 28, pastCycles: 3 },
  { key: "OW4", prefix: "EXPU", serial: "403107", size: "40DC", year: 2022, maker: MAKERS.cxic, grade: "CW", tech: "SOUND", cscDays: 690, op: "ONE_WAY", locode: "RULED", terminal: "ПКТ (Первый контейнерный)", sinceDays: 42, pastCycles: 1 },
  { key: "OW5", prefix: "RZDU", serial: "771045", size: "40HC", year: 2023, maker: MAKERS.cimc, grade: "IICL6", tech: "SOUND", cscDays: 980, op: "ONE_WAY", locode: "RUVVO", terminal: "ПКТ", sinceDays: 10, pastCycles: 1 },
  { key: "OW6", prefix: "FESU", serial: "518390", size: "20DC", year: 2018, maker: MAKERS.abakan, grade: "CW", tech: "SOUND", cscDays: 145, op: "ONE_WAY", locode: "RUNVR", terminal: "НУТЭП", sinceDays: 5, pastCycles: 3 },
  { key: "OW7", prefix: "EXPU", serial: "403255", size: "40HC", year: 2022, maker: MAKERS.singamas, grade: "CW", tech: "SOUND", cscDays: 600, op: "ONE_WAY", locode: "TRIST", terminal: "Ambarli Marport", sinceDays: 20, pastCycles: 2 },
  { key: "OW8", prefix: "TKRU", serial: "205377", size: "40HC", year: 2021, maker: MAKERS.cimc, grade: "CW", tech: "SOUND", cscDays: 330, op: "ONE_WAY", locode: "CNTSN", terminal: "Tianjin TCT", sinceDays: 27, pastCycles: 2 },

  // ── Долгосрочная аренда (10) ────────────────────────────────────────────
  { key: "L1A", prefix: "EXPU", serial: "400128", size: "40HC", year: 2020, maker: MAKERS.cimc, grade: "CW", tech: "SOUND", cscDays: 260, op: "LONG_TERM_LEASE", locode: "RUVVO", terminal: "ВМТП", sinceDays: 410, pastCycles: 2 },
  { key: "L1B", prefix: "EXPU", serial: "400135", size: "40HC", year: 2020, maker: MAKERS.cimc, grade: "CW", tech: "SOUND", cscDays: 262, op: "LONG_TERM_LEASE", locode: "RUVVO", terminal: "ВМТП", sinceDays: 410, pastCycles: 1 },
  { key: "L1C", prefix: "EXPU", serial: "400142", size: "40HC", year: 2021, maker: MAKERS.cimc, grade: "CW", tech: "SOUND", cscDays: 470, op: "LONG_TERM_LEASE", locode: "RUVVO", terminal: "ВМТП", sinceDays: 410, pastCycles: 1 },
  { key: "L1D", prefix: "RZDU", serial: "770512", size: "40HC", year: 2021, maker: MAKERS.singamas, grade: "CW", tech: "SOUND", cscDays: 455, op: "LONG_TERM_LEASE", locode: "RUVVO", terminal: "ВМТП", sinceDays: 410, pastCycles: 1 },
  { key: "L2A", prefix: "FESU", serial: "517015", size: "20DC", year: 2019, maker: MAKERS.dfic, grade: "CW", tech: "SOUND", cscDays: 380, op: "LONG_TERM_LEASE", locode: "RULED", terminal: "Петролеспорт", sinceDays: 170, pastCycles: 3 },
  { key: "L2B", prefix: "FESU", serial: "517022", size: "20DC", year: 2019, maker: MAKERS.dfic, grade: "CW", tech: "SOUND", cscDays: 384, op: "LONG_TERM_LEASE", locode: "RULED", terminal: "Петролеспорт", sinceDays: 170, pastCycles: 2 },
  { key: "L2C", prefix: "TKRU", serial: "203614", size: "20DC", year: 2018, maker: MAKERS.abakan, grade: "WWT", tech: "SOUND", cscDays: 18, op: "LONG_TERM_LEASE", locode: "RULED", terminal: "Петролеспорт", sinceDays: 170, pastCycles: 3 },
  { key: "L3A", prefix: "EXPU", serial: "401203", size: "40HC", year: 2022, maker: MAKERS.cxic, grade: "CW", tech: "SOUND", cscDays: 720, op: "LONG_TERM_LEASE", locode: "RUVVO", terminal: "ПКТ", sinceDays: 120, pastCycles: 1 },
  { key: "L3B", prefix: "TKRU", serial: "204120", size: "40HC", year: 2021, maker: MAKERS.cimc, grade: "CW", tech: "SOUND", cscDays: 300, op: "LONG_TERM_LEASE", locode: "RUVVO", terminal: "ПКТ", sinceDays: 120, pastCycles: 2 },
  { key: "L4A", prefix: "EXPU", serial: "405001", size: "40HR", year: 2023, maker: MAKERS.mci, grade: "IICL6", tech: "SOUND", cscDays: 1020, op: "LONG_TERM_LEASE", locode: "RUNVR", terminal: "НУТЭП", sinceDays: 60, pastCycles: 0 },

  // ── Сток (AVAILABLE) ────────────────────────────────────────────────────
  { key: "A1", prefix: "EXPU", serial: "401556", size: "40HC", year: 2020, maker: MAKERS.cimc, grade: "CW", tech: "SOUND", cscDays: 205, op: "AVAILABLE", locode: "RUVVO", terminal: "ВМТП", sinceDays: 47, storageRate: 3.5, pastCycles: 1, notes: "Возвращен из аренды LC-2025/006. Профицит во Владивостоке — кандидат на One-Way в Москву/Новосибирск." },
  { key: "A2", prefix: "EXPU", serial: "402004", size: "20DC", year: 2021, maker: MAKERS.dfic, grade: "CW", tech: "SOUND", cscDays: 540, op: "AVAILABLE", locode: "RUMOW", terminal: "ТЛЦ Ворсино", sinceDays: 12, storageRate: 1.8, pastCycles: 3 },
  { key: "A3", prefix: "FESU", serial: "517622", size: "40HC", year: 2022, maker: MAKERS.singamas, grade: "IICL6", tech: "SOUND", cscDays: 760, op: "AVAILABLE", locode: "CNSHA", terminal: "Shanghai SIPG", sinceDays: 6, storageRate: 2, pastCycles: 2 },
  { key: "A4", prefix: "TKRU", serial: "203990", size: "20DC", year: 2017, maker: MAKERS.abakan, grade: "WWT", tech: "SOUND", cscDays: 21, op: "AVAILABLE", locode: "RUNVR", terminal: "НУТЭП", sinceDays: 18, storageRate: 2.5, pastCycles: 4, notes: "Табличка КБК истекает — запланировать освидетельствование ACEP до выдачи." },
  { key: "A5", prefix: "RZDU", serial: "770318", size: "40HC", year: 2023, maker: MAKERS.cimc, grade: "IICL6", tech: "SOUND", cscDays: 890, op: "AVAILABLE", locode: "RULED", terminal: "Петролеспорт", sinceDays: 25, storageRate: 3, pastCycles: 1 },
  { key: "A6", prefix: "EXPU", serial: "403488", size: "20HQ", year: 2024, maker: MAKERS.cxic, grade: "IICL6", tech: "SOUND", cscDays: 1340, op: "AVAILABLE", locode: "RUMOW", terminal: "ТЛЦ Ховрино", sinceDays: 3, storageRate: 1.8, pastCycles: 0 },
  { key: "A7", prefix: "EXPU", serial: "401890", size: "40FR", year: 2019, maker: MAKERS.cimc, grade: "CW", tech: "SOUND", cscDays: -6, op: "AVAILABLE", locode: "RUNVR", terminal: "НЛЭ", sinceDays: 22, storageRate: 4, pastCycles: 2, notes: "Исправен, но табличка КБК (CSC) просрочена — система блокирует выдачу в One-Way, аренду и Gate-Out до освидетельствования ACEP." },
  { key: "A8", prefix: "EXPU", serial: "404011", size: "20OT", year: 2020, maker: MAKERS.singamas, grade: "CW", tech: "SOUND", cscDays: 420, op: "AVAILABLE", locode: "RULED", terminal: "ПКТ (Первый контейнерный)", sinceDays: 9, storageRate: 2.2, pastCycles: 2 },

  // ── Повреждены / в ремонте / заблокирован ──────────────────────────────
  { key: "D1", prefix: "FESU", serial: "516877", size: "20DC", year: 2016, maker: MAKERS.dfic, grade: "DAMAGED", tech: "DAMAGED", cscDays: 12, eor: 1240, op: "AVAILABLE", locode: "RUMOW", terminal: "ТЛЦ Ворсино", sinceDays: 4, storageRate: 1.8, pastCycles: 4, notes: "Пробоина боковой стенки 30×12 см, деформация нижней боковой балки. Претензия к контрагенту по One-Way OW-2026-0871." },
  { key: "D2", prefix: "RZDU", serial: "769930", size: "40HC", year: 2018, maker: MAKERS.cimc, grade: "DAMAGED", tech: "IN_REPAIR", cscDays: -4, eor: 860, op: "MAINTENANCE", locode: "RUVVO", terminal: "ПКТ", sinceDays: 9, pastCycles: 3, notes: "Замена напольного покрытия (2 панели), правка дверного проёма. КБК просрочена — освидетельствование после ремонта." },
  { key: "H1", prefix: "EXPU", serial: "400771", size: "20DC", year: 2019, maker: MAKERS.cxic, grade: "CW", tech: "HOLD", cscDays: 350, op: "AVAILABLE", locode: "RUNVR", terminal: "Новороссийский МТП", sinceDays: 15, storageRate: 2.5, pastCycles: 2, notes: "Блокировка ФТС: досмотр по последней поставке контрагента. Выдача запрещена до снятия запрета." },

  // ── Собственные рейсы ───────────────────────────────────────────────────
  { key: "T1", prefix: "EXPU", serial: "404102", size: "40HC", year: 2024, maker: MAKERS.cimc, grade: "IICL6", tech: "SOUND", cscDays: 1400, op: "IN_TRANSIT", locode: "RUVVO", terminal: "В пути: ж/д ВМТП → ТЛЦ Ворсино", sinceDays: 6, pastCycles: 0 },
  { key: "T2", prefix: "TKRU", serial: "205901", size: "20DC", year: 2020, maker: MAKERS.dfic, grade: "CW", tech: "SOUND", cscDays: 280, op: "IN_TRANSIT", locode: "CNNGB", terminal: "В пути: море Ningbo → ВМТП", sinceDays: 8, pastCycles: 2 },
];

export interface ActiveTripSpec {
  containerKey: string;
  counterparty: string;
  inn: string;
  contact: string;
  bookingRef: string;
  dropoff: [locode: string, terminal: string];
  freeDays: number;
  feeUsd: number;
  detentionRate: number;
}

/** Выдача = `sinceDays` назад, точка выдачи = текущая локация контейнера. */
export const ACTIVE_TRIPS: readonly ActiveTripSpec[] = [
  // Просрочены (капает детеншн)
  { containerKey: "OW1", counterparty: "ООО «Синотранс Евразия»", inn: "7736284519", contact: "Ли Вэй, +7 495 120-44-18", bookingRef: "OW-2026-0912", dropoff: ["RUMOW", "ТЛЦ Ворсино"], freeDays: 45, feeUsd: 0, detentionRate: 15 },
  { containerKey: "OW2", counterparty: "ООО «Азия Карго Групп»", inn: "2540198763", contact: "Ковалёв Д., +7 423 230-15-77", bookingRef: "OW-2026-0934", dropoff: ["RUMOW", "ТЛЦ Ховрино"], freeDays: 30, feeUsd: 150, detentionRate: 20 },
  // Горящие (2–3 дня)
  { containerKey: "OW3", counterparty: "ООО «Сибтранслогистик»", inn: "5406571123", contact: "Белова Н., +7 383 211-09-40", bookingRef: "OW-2026-0958", dropoff: ["RUOVB", "ТК Клещиха"], freeDays: 30, feeUsd: 0, detentionRate: 12 },
  { containerKey: "OW4", counterparty: "АО «Уралпромснаб»", inn: "6671093345", contact: "Шестаков И., +7 343 287-60-12", bookingRef: "OW-2026-0947", dropoff: ["RUYEK", "ТЛЦ Екатеринбург-Товарный"], freeDays: 45, feeUsd: 100, detentionRate: 15 },
  // В графике
  { containerKey: "OW5", counterparty: "ООО «Дальневосточная Транспортная Компания»", inn: "2536244810", contact: "Ким А., +7 423 265-33-90", bookingRef: "OW-2026-1003", dropoff: ["RUMOW", "ТЛЦ Белый Раст"], freeDays: 30, feeUsd: 0, detentionRate: 15 },
  { containerKey: "OW6", counterparty: "ООО «ЮгЭкспедиция»", inn: "2315176602", contact: "Арутюнян С., +7 8617 30-41-22", bookingRef: "OW-2026-1015", dropoff: ["RUMOW", "ТЛЦ Ворсино"], freeDays: 21, feeUsd: 50, detentionRate: 10 },
  { containerKey: "OW7", counterparty: "Anatolia Logistics Ltd.", inn: "9909561230", contact: "Mehmet Yilmaz, +90 212 555-18-40", bookingRef: "OW-2026-0988", dropoff: ["RUNVR", "НУТЭП"], freeDays: 30, feeUsd: 200, detentionRate: 18 },
  { containerKey: "OW8", counterparty: "ООО «Шёлковый Путь Логистик»", inn: "7714408821", contact: "Орлова М., +7 495 980-71-05", bookingRef: "OW-2026-0975", dropoff: ["RUMOW", "ТЛЦ Электроугли"], freeDays: 35, feeUsd: 0, detentionRate: 15 },
];

export interface LeaseSpec {
  contractNumber: string;
  lessee: string;
  inn: string;
  contactPerson: string;
  phone: string;
  email: string;
  containerKeys: string[];
  startDaysAgo: number;
  endInDays: number;
  autoRenewal: boolean;
  dailyRate: number;
  deposit: number;
  paymentStatus: "PAID" | "PENDING" | "OVERDUE";
  allowedReturn: string[];
  status: "ACTIVE" | "COMPLETED";
  offHireDaysAgo?: number;
  notes?: string;
}

export const LEASES: readonly LeaseSpec[] = [
  {
    contractNumber: "LC-2025/014", lessee: "ООО «ТрансКонтейнер Логистик»", inn: "7708591164", contactPerson: "Громов Павел Сергеевич",
    phone: "+7 495 788-17-17", email: "p.gromov@tc-logistic.ru", containerKeys: ["L1A", "L1B", "L1C", "L1D"],
    startDaysAgo: 410, endInDays: 320, autoRenewal: true, dailyRate: 4.2, deposit: 2000, paymentStatus: "PAID",
    allowedReturn: ["RUVVO", "RUNVS", "RUMOW"], status: "ACTIVE", notes: "Пакет 4×40HC под сервис Владивосток — Москва.",
  },
  {
    contractNumber: "LC-2026/003", lessee: "ООО «Балтика Фрейт»", inn: "7810443987", contactPerson: "Лебедева Ольга Викторовна",
    phone: "+7 812 336-50-20", email: "o.lebedeva@balticafreight.ru", containerKeys: ["L2A", "L2B", "L2C"],
    startDaysAgo: 170, endInDays: 10, autoRenewal: false, dailyRate: 2.5, deposit: 900, paymentStatus: "PENDING",
    allowedReturn: ["RULED", "RUMOW"], status: "ACTIVE", notes: "Договор истекает — согласовать продление или Off-Hire на Петролеспорт.",
  },
  {
    contractNumber: "LC-2026/007", lessee: "ООО «Восток-Транзит»", inn: "2537120458", contactPerson: "Пак Виктор Ильич",
    phone: "+7 423 279-88-04", email: "v.pak@vostok-tranzit.ru", containerKeys: ["L3A", "L3B"],
    startDaysAgo: 120, endInDays: 245, autoRenewal: false, dailyRate: 4.4, deposit: 1200, paymentStatus: "OVERDUE",
    allowedReturn: ["RUVVO", "RUNVS"], status: "ACTIVE", notes: "Счёт за прошлый месяц не оплачен (просрочка 12 дней). Направлена претензия.",
  },
  {
    contractNumber: "LC-2026/011", lessee: "ООО «Черноморская Экспедиторская Компания»", inn: "2315209931", contactPerson: "Демченко Артём Олегович",
    phone: "+7 8617 67-20-30", email: "a.demchenko@chek-nvr.ru", containerKeys: ["L4A"],
    startDaysAgo: 60, endInDays: 25, autoRenewal: true, dailyRate: 9.8, deposit: 3000, paymentStatus: "PAID",
    allowedReturn: ["RUNVR"], status: "ACTIVE", notes: "Рефконтейнер 40HR под перевозку цитрусовых. Автопролонгация на 3 мес.",
  },
  {
    contractNumber: "LC-2025/006", lessee: "ООО «Приморская Стивидорная Компания»", inn: "2540067712", contactPerson: "Сорокин Игорь Петрович",
    phone: "+7 423 241-62-10", email: "i.sorokin@psk-vl.ru", containerKeys: ["A1"],
    startDaysAgo: 412, endInDays: -47, autoRenewal: false, dailyRate: 4.0, deposit: 500, paymentStatus: "PAID",
    allowedReturn: ["RUVVO"], status: "COMPLETED", offHireDaysAgo: 47,
  },
];

export const COUNTERPARTIES = [
  { name: "ООО «ФЕСКО Интегрированный Транспорт»", inn: "2540083012" },
  { name: "ООО «Модуль Логистик»", inn: "7725310947" },
  { name: "ООО «РусКарго Восток»", inn: "2538144210" },
  { name: "АО «Евразийский Терминал»", inn: "7706523811" },
  { name: "ООО «Кама Трейд Логистик»", inn: "1650287754" },
  { name: "ООО «Нева Экспедиция»", inn: "7842190335" },
] as const;

export const HISTORY_ROUTES: readonly [from: [string, string], to: [string, string]][] = [
  [["CNSHA", "Shanghai SIPG"], ["RUMOW", "ТЛЦ Ворсино"]],
  [["RUVVO", "ВМТП"], ["RUMOW", "ТЛЦ Ховрино"]],
  [["CNNGB", "Ningbo Beilun"], ["RUVVO", "ПКТ"]],
  [["RULED", "Петролеспорт"], ["RUMOW", "ТЛЦ Белый Раст"]],
  [["RUNVR", "НУТЭП"], ["RUMOW", "ТЛЦ Ворсино"]],
  [["RUVVO", "ПКТ"], ["RUOVB", "ТК Клещиха"]],
  [["TRIST", "Kumport"], ["RUNVR", "НЛЭ"]],
  [["RUMOW", "ТЛЦ Ворсино"], ["RUVVO", "ВМТП"]],
];
