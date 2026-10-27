import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "lucide-react";
import { PrintToolbar } from "@/components/one-way/print-toolbar";
import { requireSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { computeTripTiming } from "@/lib/domain/one-way";
import { SIZE_TYPE_LABELS, TRIP_STATUS_LABELS, isOneOf, SIZE_TYPES, locodeCity } from "@/lib/domain/constants";
import { formatBic } from "@/lib/iso6346";
import { formatDate, formatDateTime, formatDays, formatNumber, formatUsd } from "@/lib/format";
import { businessTimeZone, businessToday } from "@/lib/business-time";
import { mulRate } from "@/lib/money";
import { FREE_TIME_CONVENTION, FREE_TIME_CONVENTION_LABELS } from "@/lib/domain/one-way";

type Params = Promise<{ id: string }>;

async function getTrip(id: string) {
  return prisma.oneWayTrip.findUnique({
    where: { id },
    include: { container: { select: { bicCode: true, sizeType: true, isoCode: true, tareWeightKg: true, maxGrossWeightKg: true, maxPayloadKg: true } } },
  });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const trip = await getTrip(id);
  return { title: trip ? `Release Order ${trip.bookingRef}` : "Документ не найден" };
}

const DETENTION_EXAMPLES = [1, 5, 10, 30];

export default async function ReleaseOrderPage({ params }: { params: Params }) {
  const session = await requireSession();
  const { id } = await params;
  const trip = await getTrip(id);
  if (!trip) notFound();

  const now = businessToday();
  const timing = computeTripTiming(trip, now);
  const { container } = trip;
  const sizeLabel = isOneOf(SIZE_TYPES, container.sizeType) ? SIZE_TYPE_LABELS[container.sizeType] : container.sizeType;
  const bic = formatBic(container.bicCode);

  return (
    <div className="min-h-dvh bg-slate-100 print:bg-white">
      <style>{`@page { size: A4; margin: 12mm; } @media print { html, body { background: #fff; } }`}</style>
      <PrintToolbar title={`Release Order ${trip.bookingRef} · ${bic}`} />

      <main className="mx-auto max-w-4xl px-3 py-6 sm:px-6 print:max-w-none print:p-0">
        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
          {/* Шапка */}
          <header className="flex flex-col gap-4 border-b-2 border-slate-900 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-lg bg-slate-900 text-white print:border print:border-slate-900">
                <Container className="size-6" aria-hidden />
              </span>
              <div>
                <p className="text-lg font-bold tracking-tight">ООО «Экспортэксперт»</p>
                <p className="text-xs text-slate-500">Управление парком собственных контейнеров (SOC)</p>
              </div>
            </div>
            <div className="sm:text-right">
              <p className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase">Release Order</p>
              <h1 className="text-xl font-bold">Релиз и памятка на возврат порожнего контейнера</h1>
              <p className="mt-1 font-mono text-sm">
                № <b>{trip.bookingRef}</b> · от {formatDate(trip.handoverDate)}
              </p>
            </div>
          </header>

          {/* Контейнер */}
          <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="rounded-lg border-2 border-slate-900 px-5 py-3 text-center">
              <p className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Контейнер (BIC / ISO 6346)</p>
              <p className="font-mono text-3xl font-bold tracking-tight">{bic}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Item label="Типоразмер" value={sizeLabel} />
              <Item label="ISO-код типа" value={container.isoCode} mono />
              <Item label="Тара" value={`${formatNumber(container.tareWeightKg)} кг`} mono />
              <Item label="Макс. загрузка" value={`${formatNumber(container.maxPayloadKg)} кг`} mono />
              <Item label="Брутто (MGW)" value={`${formatNumber(container.maxGrossWeightKg)} кг`} mono />
              <Item label="Статус рейса" value={TRIP_STATUS_LABELS[timing.status]} />
            </dl>
          </section>

          {/* Контрагент */}
          <section className="mt-6 rounded-lg bg-slate-50 p-4 print:border print:border-slate-300 print:bg-white">
            <SectionTitle>Контрагент (получатель контейнера)</SectionTitle>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Item label="Наименование" value={trip.counterpartyName} />
              <Item label="ИНН" value={trip.counterpartyInn ?? "—"} mono />
              <Item label="Контакт" value={trip.counterpartyContact ?? "—"} />
            </dl>
          </section>

          {/* Маршрут */}
          <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-300 p-4">
              <SectionTitle>А · Выдача (Pick-up / Gate-Out)</SectionTitle>
              <p className="mt-2 text-lg font-semibold">{locodeCity(trip.pickupLocode)}</p>
              <p className="text-sm">{trip.pickupTerminal}</p>
              <p className="mt-2 font-mono text-xs text-slate-500">UN/LOCODE {trip.pickupLocode} · Gate-Out {formatDate(trip.handoverDate)}</p>
            </div>
            <div className="rounded-lg border-2 border-indigo-600 bg-indigo-50/50 p-4 print:bg-white">
              <SectionTitle className="text-indigo-700">Б · Обязательный возврат (Drop-off)</SectionTitle>
              <p className="mt-2 text-lg font-semibold">{locodeCity(trip.dropoffLocode)}</p>
              <p className="text-sm font-medium">{trip.dropoffTerminal}</p>
              <p className="mt-2 font-mono text-xs text-slate-500">UN/LOCODE {trip.dropoffLocode} · сдача только на этот терминал</p>
            </div>
          </section>

          {/* Ключевые условия */}
          <section className="mt-6 grid grid-cols-2 overflow-hidden rounded-lg border-2 border-slate-900 sm:grid-cols-4">
            <Term label="Свободных дней (Free Time)" value={formatDays(trip.freeDays)} />
            <Term label="Free Time Deadline — сдать до" value={formatDate(trip.deadlineDate)} accent />
            <Term label="Детеншн за каждые сутки просрочки" value={`${formatUsd(trip.detentionRatePerDayUsd, 2)}`} />
            <Term label="Фикс. ставка / депозит" value={trip.feeUsd > 0 ? formatUsd(trip.feeUsd, 2) : "Без оплаты"} />
          </section>
          <p className="mt-2 text-xs text-slate-600">
            Free Time: {FREE_TIME_CONVENTION_LABELS[FREE_TIME_CONVENTION]}; {formatDate(trip.deadlineDate)} — последний бесплатный день,
            детеншн начисляется за каждые сутки после него, включая день Gate-In. Пример начисления детеншна:{" "}
            {DETENTION_EXAMPLES.map((d) => `${formatDays(d)} — ${formatUsd(mulRate(trip.detentionRatePerDayUsd, d))}`).join(" · ")}.
          </p>

          {/* Условия */}
          <section className="mt-6">
            <SectionTitle>Условия возврата</SectionTitle>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
              <li>Контейнер сдаётся порожним, чистым, без остатков груза, крепежа и посторонних наклеек; знаки опасности (IMO) удалены.</li>
              <li>Сдача производится только на терминал, указанный в разделе «Б». Сдача в иное место — по письменному согласованию с компенсацией затрат на репозиционирование.</li>
              <li>
                Свободное время исчисляется с даты Gate-Out. За каждые сутки после {formatDate(trip.deadlineDate)} начисляется детеншн{" "}
                {formatUsd(trip.detentionRatePerDayUsd, 2)}/сутки до даты фактического Gate-In.
              </li>
              <li>При приёмке составляется акт осмотра (EIR). Повреждения оцениваются по стандарту IICL; стоимость ремонта (EOR) выставляется контрагенту.</li>
              <li>Утрата или неправомерное удержание контейнера влечёт возмещение его рыночной стоимости.</li>
            </ol>
          </section>

          {(timing.status === "OVERDUE" || trip.actualReturnDate) && (
            <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm print:bg-white">
              {trip.actualReturnDate
                ? `Отметка FMS: контейнер принят ${formatDate(trip.actualReturnDate)} на «${trip.dropoffTerminal}». ${timing.overdueDays > 0 ? `Просрочка ${formatDays(timing.overdueDays)}, детеншн ${formatUsd(timing.detentionUsd)}.` : "Возврат в пределах свободного времени."}`
                : `Отметка FMS на ${formatDate(now)}: просрочка ${formatDays(timing.overdueDays)}, начислен детеншн ${formatUsd(timing.detentionUsd)}.`}
            </section>
          )}

          {/* Подписи */}
          <section className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
            <Signature role="Выдал: ООО «Экспортэксперт»" />
            <Signature role={`Принял: ${trip.counterpartyName}`} />
          </section>

          <footer className="mt-10 border-t border-slate-200 pt-3 text-[11px] text-slate-400">
            Сформировано в FMS «Экспортэксперт» {formatDateTime(new Date())} ({businessTimeZone()}) · {session.name} · документ {trip.bookingRef}
          </footer>
        </article>
      </main>
    </div>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-xs font-semibold tracking-wide text-slate-500 uppercase ${className ?? ""}`}>{children}</h2>;
}

function Item({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className={`font-medium break-words ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function Term({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`border-slate-300 p-3 odd:border-r sm:border-r sm:last:border-r-0 ${accent ? "bg-slate-900 text-white print:bg-white print:text-slate-900" : ""}`}>
      <p className={`text-[10px] font-semibold tracking-wide uppercase ${accent ? "text-indigo-200 print:text-slate-500" : "text-slate-500"}`}>{label}</p>
      <p className="mt-1 font-mono text-xl font-bold">{value}</p>
    </div>
  );
}

function Signature({ role }: { role: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{role}</p>
      <div className="mt-10 flex items-end gap-3 text-xs text-slate-400">
        <span className="flex-1 border-b border-slate-400" />
        <span>подпись / Ф.И.О.</span>
      </div>
      <p className="mt-3 text-xs text-slate-400">М.П. · «____» ______________ 20___ г.</p>
    </div>
  );
}
