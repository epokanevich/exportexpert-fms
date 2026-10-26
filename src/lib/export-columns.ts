/** Наборы колонок для CSV-выгрузок реестра, One-Way и аренды. */
import type { CsvColumn } from "./csv";
import { formatBic } from "./iso6346";
import {
  CONDITION_GRADE_LABELS,
  OPERATIONAL_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  TECH_STATUS_LABELS,
  TRIP_STATUS_LABELS,
  locodeCity,
} from "./domain/constants";
import type { ContainerRow } from "./queries/containers";
import type { LeaseRow, TripRow } from "./queries/operations";

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

const CSC_LEVEL_LABELS: Record<string, string> = { OK: "Действует", EXPIRING: "Истекает", EXPIRED: "Просрочена" };

export const REGISTRY_CSV_COLUMNS: CsvColumn<ContainerRow>[] = [
  { header: "Номер контейнера (ISO 6346)", value: (r) => formatBic(r.bicCode) },
  { header: "Типоразмер", value: (r) => r.sizeType },
  { header: "ISO-код", value: (r) => r.isoCode },
  { header: "Год выпуска", value: (r) => r.manufactureYear },
  { header: "Изготовитель", value: (r) => r.manufacturer },
  { header: "Операционный статус", value: (r) => label(OPERATIONAL_STATUS_LABELS, r.operationalStatus) },
  { header: "Текущая операция", value: (r) => r.activity },
  { header: "UN/LOCODE", value: (r) => r.currentLocode },
  { header: "Город", value: (r) => locodeCity(r.currentLocode) },
  { header: "Терминал / депо", value: (r) => r.currentTerminal },
  { header: "Грейд", value: (r) => label(CONDITION_GRADE_LABELS, r.conditionGrade) },
  { header: "Тех. статус", value: (r) => label(TECH_STATUS_LABELS, r.techStatus) },
  { header: "КБК (CSC) до", value: (r) => r.cscPlateExpiry },
  { header: "Статус КБК", value: (r) => CSC_LEVEL_LABELS[r.csc.level] },
  { header: "EOR, $", value: (r) => r.eorAmountUsd },
  { header: "Дней на стоке", value: (r) => r.idleDays },
  { header: "Стоимость хранения, $", value: (r) => (r.idleDays !== null ? r.storageCostUsd : null) },
  { header: "Накопленная выручка, $", value: (r) => r.totalRevenueUsd },
  { header: "ROI, %", value: (r) => Math.round(r.roi * 1000) / 10 },
];

export const ONE_WAY_CSV_COLUMNS: CsvColumn<TripRow>[] = [
  { header: "Контейнер", value: (t) => formatBic(t.bicCode) },
  { header: "Типоразмер", value: (t) => t.sizeType },
  { header: "Заявка / договор", value: (t) => t.bookingRef },
  { header: "Контрагент", value: (t) => t.counterpartyName },
  { header: "ИНН", value: (t) => t.counterpartyInn },
  { header: "Контакт", value: (t) => t.counterpartyContact },
  { header: "Выдача: LOCODE", value: (t) => t.pickupLocode },
  { header: "Выдача: терминал", value: (t) => `${locodeCity(t.pickupLocode)}, ${t.pickupTerminal}` },
  { header: "Возврат: LOCODE", value: (t) => t.dropoffLocode },
  { header: "Возврат: терминал", value: (t) => `${locodeCity(t.dropoffLocode)}, ${t.dropoffTerminal}` },
  { header: "Дата выдачи (Gate-Out)", value: (t) => t.handoverDate },
  { header: "Свободных дней", value: (t) => t.freeDays },
  { header: "Дедлайн возврата", value: (t) => t.deadlineDate },
  { header: "Фактический возврат (Gate-In)", value: (t) => t.actualReturnDate },
  { header: "Статус", value: (t) => label(TRIP_STATUS_LABELS, t.timing.status) },
  { header: "Осталось дней", value: (t) => t.timing.daysLeft },
  { header: "Дней просрочки", value: (t) => t.timing.overdueDays },
  { header: "Ставка детеншна, $/сут", value: (t) => t.detentionRatePerDayUsd },
  { header: "Детеншн начислен, $", value: (t) => t.timing.detentionUsd },
  { header: "Фикс. ставка / депозит, $", value: (t) => t.feeUsd },
  { header: "EOR при сдаче, $", value: (t) => t.returnEorUsd },
];

export const LEASE_CSV_COLUMNS: CsvColumn<LeaseRow>[] = [
  { header: "Договор", value: (l) => l.contractNumber },
  { header: "Арендатор", value: (l) => l.lesseeName },
  { header: "ИНН", value: (l) => l.lesseeInn },
  { header: "Контактное лицо", value: (l) => l.contactPerson },
  { header: "Телефон", value: (l) => l.contactPhone },
  { header: "Email", value: (l) => l.contactEmail },
  { header: "On-Hire", value: (l) => l.startDate },
  { header: "Плановый Off-Hire", value: (l) => l.endDate },
  { header: "Дней до окончания", value: (l) => (l.status === "ACTIVE" ? l.metrics.daysToEnd : null) },
  { header: "Автопролонгация", value: (l) => l.autoRenewal },
  { header: "Ед. на руках", value: (l) => l.metrics.activeUnits },
  { header: "Ед. всего", value: (l) => l.metrics.totalUnits },
  { header: "Per Diem, $/сут", value: (l) => l.dailyRateUsd },
  { header: "Депозит, $", value: (l) => l.depositUsd },
  { header: "Оплата текущего месяца", value: (l) => label(PAYMENT_STATUS_LABELS, l.paymentStatus) },
  { header: "Начислено за месяц, $", value: (l) => l.metrics.accruedThisMonthUsd },
  { header: "Начислено за срок, $", value: (l) => l.metrics.accruedTotalUsd },
  { header: "Доход в месяц (run-rate), $", value: (l) => l.metrics.monthlyRunRateUsd },
  { header: "Регионы возврата", value: (l) => l.allowedReturnLocodes.join(", ") },
  { header: "Статус договора", value: (l) => (l.status === "ACTIVE" ? "Действует" : "Закрыт") },
];
