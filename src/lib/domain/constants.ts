/** Справочники домена. В БД хранятся ключи, подписи — только здесь. */

export const SIZE_TYPES = ["20DC", "20HQ", "40DC", "40HC", "40HR", "20OT", "40FR"] as const;
export type SizeType = (typeof SIZE_TYPES)[number];

export const SIZE_TYPE_LABELS: Record<SizeType, string> = {
  "20DC": "20DC — Dry Cargo",
  "20HQ": "20HQ — High Cube",
  "40DC": "40DC — Dry Cargo",
  "40HC": "40HC — High Cube",
  "40HR": "40HR — Reefer",
  "20OT": "20OT — Open Top",
  "40FR": "40FR — Flat Rack",
};

/** Типовые ISO-коды типоразмеров (подставляются по умолчанию при создании). */
export const DEFAULT_ISO_CODE: Record<SizeType, string> = {
  "20DC": "22G1",
  "20HQ": "25G1",
  "40DC": "42G1",
  "40HC": "45G1",
  "40HR": "45R1",
  "20OT": "22U1",
  "40FR": "45P3",
};

/** Типовые массогабаритные характеристики (кг) для автозаполнения формы. */
export const DEFAULT_WEIGHTS: Record<SizeType, { tare: number; gross: number }> = {
  "20DC": { tare: 2230, gross: 30480 },
  "20HQ": { tare: 2350, gross: 30480 },
  "40DC": { tare: 3750, gross: 30480 },
  "40HC": { tare: 3900, gross: 32500 },
  "40HR": { tare: 4800, gross: 34000 },
  "20OT": { tare: 2350, gross: 30480 },
  "40FR": { tare: 5600, gross: 45000 },
};

export function teuOf(sizeType: string): number {
  return sizeType.startsWith("40") ? 2 : 1;
}

export const CONDITION_GRADES = ["IICL6", "CW", "WWT", "DAMAGED"] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];
export const CONDITION_GRADE_LABELS: Record<ConditionGrade, string> = {
  IICL6: "IICL-6",
  CW: "Cargo Worthy (CW)",
  WWT: "Wind & Water Tight (WWT)",
  DAMAGED: "Damaged / Требует ремонта",
};
export const CONDITION_GRADE_SHORT: Record<ConditionGrade, string> = {
  IICL6: "IICL-6",
  CW: "CW",
  WWT: "WWT",
  DAMAGED: "DMG",
};

export const TECH_STATUSES = ["SOUND", "DAMAGED", "IN_REPAIR", "HOLD"] as const;
export type TechStatus = (typeof TECH_STATUSES)[number];
export const TECH_STATUS_LABELS: Record<TechStatus, string> = {
  SOUND: "Исправен",
  DAMAGED: "Поврежден",
  IN_REPAIR: "В ремонте",
  HOLD: "Заблокирован",
};

export const OPERATIONAL_STATUSES = [
  "AVAILABLE",
  "ONE_WAY",
  "LONG_TERM_LEASE",
  "RESERVED",
  "IN_TRANSIT",
  "MAINTENANCE",
  "WRITTEN_OFF",
] as const;
export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];
export const OPERATIONAL_STATUS_LABELS: Record<OperationalStatus, string> = {
  AVAILABLE: "Свободен на стоке",
  ONE_WAY: "One-Way",
  LONG_TERM_LEASE: "Долгосрочная аренда",
  IN_TRANSIT: "В собственном рейсе",
  MAINTENANCE: "На ремонте",
  RESERVED: "Резерв под аренду",
  WRITTEN_OFF: "Списан",
};
/** Статусы, которые назначаются только операциями (One-Way, аренда, списание), но не формой «Изменить». */
export const MANAGED_OPERATIONAL_STATUSES: readonly OperationalStatus[] = ["ONE_WAY", "LONG_TERM_LEASE", "RESERVED", "WRITTEN_OFF"];
/** Статусы, которые можно выбрать в карточке контейнера вручную. */
export const EDITABLE_OPERATIONAL_STATUSES = ["AVAILABLE", "IN_TRANSIT", "MAINTENANCE"] as const;
/** Статусы, в которых контейнер приносит доход / задействован. */
export const UTILIZED_STATUSES: readonly OperationalStatus[] = ["ONE_WAY", "LONG_TERM_LEASE", "IN_TRANSIT"];

export const TRIP_STATUSES = ["ACTIVE", "OVERDUE", "COMPLETED", "DISPUTE"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];
/** Статусы, которые реально хранятся в БД (OVERDUE — вычисляемый). */
export type StoredTripStatus = Exclude<TripStatus, "OVERDUE">;
export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  ACTIVE: "В пути",
  OVERDUE: "Просрочен возврат",
  COMPLETED: "Возвращен",
  DISPUTE: "Претензия",
};

export const PAYMENT_STATUSES = ["PAID", "PENDING", "OVERDUE"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PAID: "Оплачено",
  PENDING: "Ожидает оплаты",
  OVERDUE: "Задолженность",
};

export const SURVEY_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Не начат",
  PENDING: "Ожидает подписания",
  SIGNED: "Подписан",
};

/** SCHEDULED — договор оформлен, дата On-Hire ещё не наступила (D-19). */
export const LEASE_STATUSES = ["SCHEDULED", "ACTIVE", "COMPLETED"] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];
export const LEASE_STATUS_LABELS: Record<LeaseStatus, string> = { SCHEDULED: "Ожидает On-Hire", ACTIVE: "Действует", COMPLETED: "Закрыт" };

export const EVENT_TYPES = [
  "PURCHASE",
  "GATE_IN",
  "GATE_OUT",
  "ONE_WAY_OUT",
  "ONE_WAY_IN",
  "LEASE_ON_HIRE",
  "LEASE_OFF_HIRE",
  "LEASE_EXTENDED",
  "INSPECTION",
  "REPAIR_START",
  "REPAIR_DONE",
  "STATUS_CHANGE",
  "CSC_RENEWAL",
  "WRITE_OFF",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
/** Типы, которые можно записать в журнал вручную: покупка и списание создаются только своими операциями. */
export const MANUAL_EVENT_TYPES = EVENT_TYPES.filter((t): t is Exclude<EventType, "PURCHASE" | "WRITE_OFF"> => t !== "PURCHASE" && t !== "WRITE_OFF");
export type ManualEventType = (typeof MANUAL_EVENT_TYPES)[number];
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  PURCHASE: "Покупка / ввод в парк",
  GATE_IN: "Gate-In",
  GATE_OUT: "Gate-Out",
  ONE_WAY_OUT: "Выдача в One-Way",
  ONE_WAY_IN: "Возврат из One-Way",
  LEASE_ON_HIRE: "On-Hire (аренда)",
  LEASE_OFF_HIRE: "Off-Hire (возврат из аренды)",
  LEASE_EXTENDED: "Продление аренды",
  INSPECTION: "Акт осмотра",
  REPAIR_START: "Передан в ремонт",
  REPAIR_DONE: "Ремонт завершен",
  STATUS_CHANGE: "Смена статуса",
  CSC_RENEWAL: "Продление КБК (CSC)",
  WRITE_OFF: "Списание из парка",
};

/** UN/LOCODE, с которыми работает компания. */
export const LOCATIONS = [
  { code: "RUVVO", city: "Владивосток", region: "Владивосток", terminals: ["ВМТП", "ПКТ", "Терминал Моряк-Рыболов"] },
  { code: "RUNVS", city: "Находка (Восточный)", region: "Владивосток", terminals: ["ВСК", "Терминал Восточный"] },
  { code: "RULED", city: "Санкт-Петербург", region: "Санкт-Петербург", terminals: ["ПКТ (Первый контейнерный)", "Петролеспорт", "Моби Дик"] },
  { code: "RUMOW", city: "Москва", region: "Москва", terminals: ["ТЛЦ Ворсино", "ТЛЦ Ховрино", "ТЛЦ Белый Раст", "ТЛЦ Электроугли"] },
  { code: "RUNVR", city: "Новороссийск", region: "Новороссийск", terminals: ["НУТЭП", "НЛЭ", "Новороссийский МТП"] },
  { code: "RUOVB", city: "Новосибирск", region: "Сибирь и Урал", terminals: ["ТК Клещиха", "ТЛЦ Чемской"] },
  { code: "RUYEK", city: "Екатеринбург", region: "Сибирь и Урал", terminals: ["ТЛЦ Екатеринбург-Товарный", "ТК Шарташ"] },
  { code: "CNSHA", city: "Шанхай", region: "Китай", terminals: ["Shanghai SIPG", "Yangshan Phase IV"] },
  { code: "CNNGB", city: "Нинбо", region: "Китай", terminals: ["Ningbo Beilun", "Ningbo Meishan"] },
  { code: "CNTSN", city: "Тяньцзинь", region: "Китай", terminals: ["Tianjin TCT"] },
  { code: "TRIST", city: "Стамбул", region: "Турция", terminals: ["Ambarli Marport", "Kumport"] },
] as const;

export const REGIONS = ["Владивосток", "Санкт-Петербург", "Москва", "Новороссийск", "Сибирь и Урал", "Китай", "Турция"] as const;

const LOCATION_BY_CODE = new Map<string, (typeof LOCATIONS)[number]>(LOCATIONS.map((l) => [l.code, l]));

export function locodeCity(code: string): string {
  return LOCATION_BY_CODE.get(code)?.city ?? code;
}

export function locodeRegion(code: string): string {
  return LOCATION_BY_CODE.get(code)?.region ?? "Прочие";
}

export function terminalsOf(code: string): readonly string[] {
  return LOCATION_BY_CODE.get(code)?.terminals ?? [];
}

/** Верхняя граница пакета в одном договоре/возврате (D-30): защищает от запроса на тысячи id. */
export const MAX_LEASE_UNITS = 200;

/** Пороги контроля. */
export const THRESHOLDS = {
  cscWarningDays: 30,
  oneWayHotDays: 5,
  idleStockDays: 30,
  leaseExpiringCriticalDays: 14,
  leaseExpiringWarningDays: 30,
} as const;

export function isOneOf<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}
