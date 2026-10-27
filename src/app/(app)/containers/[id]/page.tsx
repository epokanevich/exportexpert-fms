import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, ClipboardList, History, MapPin, Route, ShieldCheck, Wrench, FileText } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, DataList, Progress } from "@/components/ui/primitives";
import { BicCode, CscBadge, GradeBadge, OperationalStatusBadge, TechStatusBadge, TripStatusBadge } from "@/components/status-badges";
import { EventTimeline } from "@/components/containers/event-timeline";
import { ContainerProfileActions } from "@/components/containers/container-profile-actions";
import { requireSession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import type { ContainerFormValues } from "@/components/containers/container-form";
import { getContainerProfile } from "@/lib/queries/containers";
import { attentionFlagsOf, unitEconomicsOf } from "@/lib/domain/container";
import { computeTripTiming } from "@/lib/domain/one-way";
import { accrueItem } from "@/lib/domain/lease";
import { describeDamage } from "@/lib/domain/damage";
import { CONDITION_GRADE_LABELS, SIZE_TYPE_LABELS, isOneOf, CONDITION_GRADES, SIZE_TYPES, locodeCity, teuOf, OWNERSHIP_TYPES, OWNERSHIP_TYPE_LABELS } from "@/lib/domain/constants";
import { formatBic } from "@/lib/iso6346";
import { toDateInput } from "@/lib/dates";
import { formatDate, formatDays, formatNumber, formatPercent, formatUsd, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { businessToday } from "@/lib/business-time";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const c = await getContainerProfile(id);
  return { title: c ? formatBic(c.bicCode) : "Контейнер не найден" };
}

export default async function ContainerProfilePage({ params }: { params: Params }) {
  const { id } = await params;
  const [session, c] = await Promise.all([requireSession(), getContainerProfile(id)]);
  if (!c) notFound();

  const now = businessToday();
  const flags = attentionFlagsOf(c, now);
  const economics = unitEconomicsOf(c);
  const activeTrip = c.oneWayTrips.find((t) => t.status === "ACTIVE");
  const hasOpenDispute = c.oneWayTrips.some((t) => t.status === "DISPUTE");
  const activeLease = c.leaseItems.find((i) => !i.offHireDate && i.lease.status !== "COMPLETED");
  const isWrittenOff = c.deletedAt !== null;
  const tripTiming = activeTrip ? computeTripTiming(activeTrip, now) : null;
  const ageYears = now.getUTCFullYear() - c.manufactureYear;

  const formValues: ContainerFormValues = {
    bicCode: formatBic(c.bicCode),
    sizeType: c.sizeType,
    isoCode: c.isoCode,
    manufactureYear: String(c.manufactureYear),
    colorRal: c.colorRal,
    manufacturer: c.manufacturer,
    tareWeightKg: String(c.tareWeightKg),
    maxGrossWeightKg: String(c.maxGrossWeightKg),
    conditionGrade: c.conditionGrade,
    techStatus: c.techStatus,
    cscPlateExpiry: toDateInput(c.cscPlateExpiry),
    cscPlateNumber: c.cscPlateNumber ?? "",
    acepNumber: c.acepNumber ?? "",
    ownershipType: c.ownershipType,
    ownerName: c.ownerName,
    lessorName: c.lessorName ?? "",
    eorAmountUsd: c.eorAmountUsd != null ? String(c.eorAmountUsd) : "",
    operationalStatus: c.operationalStatus,
    currentLocode: c.currentLocode,
    currentTerminal: c.currentTerminal,
    storageRatePerDayUsd: c.storageRatePerDayUsd != null ? String(c.storageRatePerDayUsd) : "",
    purchaseDate: toDateInput(c.purchaseDate),
    purchasePriceUsd: String(c.purchasePriceUsd),
    currentBookValueUsd: String(c.currentBookValueUsd),
    notes: c.notes ?? "",
  };

  return (
    <>
      <Link href="/containers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Реестр контейнеров
      </Link>

      {/* Шапка профиля */}
      <Card className="relative mb-4 overflow-hidden lg:mb-6">
        <div className={cn("absolute inset-y-0 left-0 w-1.5", isWrittenOff ? "bg-slate-400" : "bg-indigo-600")} aria-hidden />
        <div className="flex flex-col gap-4 p-5 pl-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-mono text-xs tracking-widest text-slate-500 uppercase">
              {isOneOf(SIZE_TYPES, c.sizeType) ? SIZE_TYPE_LABELS[c.sizeType] : c.sizeType} · ISO {c.isoCode} · {teuOf(c.sizeType)} TEU
            </p>
            <h1 className="mt-1">
              <BicCode code={c.bicCode} size="xl" />
            </h1>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <OperationalStatusBadge status={c.operationalStatus} />
              <TechStatusBadge status={c.techStatus} />
              <GradeBadge grade={c.conditionGrade} full />
              <CscBadge csc={flags.csc} />
              {flags.storage.isIdleTooLong && <Badge tone="violet">Простой {formatDays(flags.storage.idleDays ?? 0)}</Badge>}
            </div>
          </div>
          {!isWrittenOff && (
            <ContainerProfileActions containerId={c.id} bicLabel={formatBic(c.bicCode)} formValues={formValues} canDelete={!activeTrip && !activeLease && !hasOpenDispute} canEdit={can(session.role, "fleet:edit")} canWriteOff={can(session.role, "fleet:delete")} />
          )}
        </div>
        {isWrittenOff && c.deletedAt && (
          <div role="status" className="border-t border-slate-200 bg-slate-100 px-5 py-3 pl-6 text-sm text-slate-700">
            Списан {formatDate(c.deletedAt)}. Карточка доступна только для просмотра; история и договоры сохранены.
          </div>
        )}
        {(activeTrip || activeLease) && (
          <div className="border-t border-slate-100 bg-indigo-50/50 px-5 py-3 pl-6 text-sm">
            {activeTrip && tripTiming && (
              <Link href={`/one-way?focus=${activeTrip.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 hover:underline">
                <span className="flex items-center gap-1.5 font-medium text-indigo-800"><Route className="size-4" /> One-Way {activeTrip.bookingRef}</span>
                <span className="text-slate-600">{activeTrip.counterpartyName}</span>
                <span className="font-mono text-xs text-slate-500">{activeTrip.pickupLocode} → {activeTrip.dropoffLocode}</span>
                <span className={cn("font-mono text-xs font-semibold", tripTiming.status === "OVERDUE" ? "text-rose-600" : "text-indigo-700")}>
                  {tripTiming.status === "OVERDUE" ? `Просрочка ${formatDays(tripTiming.overdueDays)} → детеншн ${formatUsd(tripTiming.detentionUsd)}` : `Осталось ${formatDays(tripTiming.daysLeft ?? 0)}`}
                </span>
              </Link>
            )}
            {activeLease && (
              <Link href={`/leases/${activeLease.lease.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 hover:underline">
                <span className="flex items-center gap-1.5 font-medium text-violet-800"><FileText className="size-4" /> Аренда {activeLease.lease.contractNumber}</span>
                <span className="text-slate-600">{activeLease.lease.lesseeName}</span>
                <span className="font-mono text-xs text-slate-500">{formatUsd(activeLease.lease.dailyRateUsd, 2)}/сут. · до {formatDate(activeLease.lease.endDate)}</span>
              </Link>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-3">
        <div className="space-y-4 lg:space-y-6">
          <Card>
            <CardHeader icon={<ClipboardList />} title="Паспорт и идентификация" />
            <CardContent>
              <DataList
                items={[
                  { label: "Номер (ISO 6346)", value: formatBic(c.bicCode), mono: true },
                  { label: "Префикс владельца", value: c.bicCode.slice(0, 4), mono: true },
                  { label: "Типоразмер", value: c.sizeType, mono: true },
                  { label: "ISO-код типа", value: c.isoCode, mono: true },
                  { label: "Год выпуска", value: `${c.manufactureYear} (${ageYears} ${plural(ageYears, ["год", "года", "лет"])})` },
                  { label: "Цвет", value: c.colorRal },
                  { label: "Завод-изготовитель", value: c.manufacturer, full: true },
                  { label: "Тара", value: `${formatNumber(c.tareWeightKg)} кг`, mono: true },
                  { label: "Макс. загрузка", value: `${formatNumber(c.maxPayloadKg)} кг`, mono: true },
                  { label: "Брутто (MGW)", value: `${formatNumber(c.maxGrossWeightKg)} кг`, mono: true },
                  { label: "Владение", value: isOneOf(OWNERSHIP_TYPES, c.ownershipType) ? OWNERSHIP_TYPE_LABELS[c.ownershipType] : c.ownershipType },
                  { label: "Собственник", value: c.ownerName },
                  ...(c.lessorName ? [{ label: "Лизингодатель", value: c.lessorName, full: true }] : []),
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader icon={<ShieldCheck />} title="Техсостояние и комплаенс" />
            <CardContent className="space-y-4">
              {flags.csc.level !== "OK" && (
                <div className={cn("rounded-lg px-3 py-2.5 text-sm ring-1", flags.csc.level === "EXPIRED" ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-amber-50 text-amber-900 ring-amber-200")}>
                  {flags.csc.level === "EXPIRED"
                    ? `Табличка КБК (CSC) просрочена на ${formatDays(-flags.csc.daysLeft)}. Эксплуатация запрещена до освидетельствования ACEP.`
                    : `До истечения КБК (CSC) осталось ${formatDays(flags.csc.daysLeft)}. Запланируйте освидетельствование.`}
                </div>
              )}
              <DataList
                items={[
                  { label: "Грейд", value: isOneOf(CONDITION_GRADES, c.conditionGrade) ? CONDITION_GRADE_LABELS[c.conditionGrade] : c.conditionGrade },
                  { label: "Тех. статус", value: <TechStatusBadge status={c.techStatus} /> },
                  { label: "Следующее освидетельствование (CSC)", value: formatDate(c.cscPlateExpiry), mono: true },
                  { label: "Табличка CSC №", value: c.cscPlateNumber ?? "—", mono: true },
                  { label: "Программа ACEP / PES", value: c.acepNumber ?? "—", mono: true },
                  { label: "EOR (оценка ремонта)", value: c.eorAmountUsd ? formatUsd(c.eorAmountUsd) : "—", mono: true },
                ]}
              />
              {c.damages.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Открытые повреждения (CEDEX)</p>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {c.damages.map((dmg) => (
                      <li key={dmg.id} className="rounded-md bg-rose-50/60 px-2.5 py-1.5 font-mono text-xs ring-1 ring-rose-100">
                        {describeDamage(dmg)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:space-y-6">
          <Card>
            <CardHeader icon={<MapPin />} title="Дислокация" />
            <CardContent>
              <DataList
                items={[
                  { label: "UN/LOCODE", value: c.currentLocode, mono: true },
                  { label: "Город / порт", value: locodeCity(c.currentLocode) },
                  { label: "Терминал / депо", value: c.currentTerminal, full: true },
                  { label: "На стоке с", value: formatDate(c.storageStartDate), mono: true },
                  { label: "Ставка хранения", value: c.storageRatePerDayUsd ? `${formatUsd(c.storageRatePerDayUsd, 2)}/сут.` : "—", mono: true },
                  { label: "Дней на стоке", value: flags.storage.idleDays !== null ? formatDays(flags.storage.idleDays) : "—" },
                  { label: "Накоплено за хранение", value: flags.storage.idleDays !== null ? formatUsd(flags.storage.storageCostUsd) : "—", mono: true },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader icon={<Banknote />} title="Экономика единицы" description="ROI = (выручка − ремонты − амортизация) / цена покупки" />
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-900 p-3 text-white">
                  <p className="text-xs text-slate-400">ROI</p>
                  <p className={cn("font-mono text-2xl font-semibold tabular", economics.roi >= 0 ? "text-emerald-400" : "text-rose-400")}>{formatPercent(economics.roi, 1)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="text-xs text-slate-500">Чистый результат</p>
                  <p className={cn("font-mono text-2xl font-semibold tabular", economics.netResultUsd >= 0 ? "text-slate-900" : "text-rose-600")}>{formatUsd(Math.round(economics.netResultUsd))}</p>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>Окупаемость (выручка − ремонты)</span>
                  <span className="font-mono">{formatPercent(economics.paybackRatio)}</span>
                </div>
                <Progress label="Окупаемость" value={economics.paybackRatio} tone={economics.paybackRatio >= 1 ? "emerald" : "indigo"} />
              </div>
              <DataList
                items={[
                  { label: "Дата покупки", value: formatDate(c.purchaseDate), mono: true },
                  { label: "Цена покупки", value: formatUsd(c.purchasePriceUsd), mono: true },
                  { label: "Остаточная стоимость", value: formatUsd(c.currentBookValueUsd), mono: true },
                  { label: "Амортизация", value: formatUsd(economics.depreciationUsd), mono: true },
                  { label: "Накопленная выручка", value: formatUsd(Math.round(c.totalRevenueUsd)), mono: true },
                  { label: "Затраты на ремонты", value: formatUsd(c.totalRepairCostUsd), mono: true },
                ]}
              />
            </CardContent>
          </Card>

          {(c.oneWayTrips.length > 0 || c.leaseItems.length > 0) && (
            <Card>
              <CardHeader icon={<Route />} title="Коммерческая история" description={`${c.oneWayTrips.length} One-Way · ${c.leaseItems.length} аренд`} />
              <ul className="divide-y divide-slate-100 text-sm">
                {c.oneWayTrips.map((t) => {
                  const timing = computeTripTiming(t, now);
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold">{t.bookingRef}</p>
                        <p className="truncate text-xs text-slate-500">{locodeCity(t.pickupLocode)} → {locodeCity(t.dropoffLocode)} · {formatDate(t.handoverDate)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <TripStatusBadge status={timing.status} />
                        {timing.detentionUsd > 0 && <span className="font-mono text-xs text-rose-600">{formatUsd(timing.detentionUsd)}</span>}
                      </div>
                    </li>
                  );
                })}
                {c.leaseItems.map((item) => (
                  <li key={item.id}>
                    <Link href={`/leases/${item.lease.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 sm:px-5">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold">{item.lease.contractNumber}</p>
                        <p className="truncate text-xs text-slate-500">{item.lease.lesseeName} · {formatDate(item.onHireDate)} — {item.offHireDate ? formatDate(item.offHireDate) : "н.в."}</p>
                      </div>
                      <span className="font-mono text-xs text-slate-600">
                        {formatUsd(accrueItem(item, item.lease.ratePeriods, item.onHireDate, now).amountUsd, 2)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card className="xl:row-span-2 xl:self-start">
          <CardHeader icon={<History />} title="История операций" description={`${c.events.length} событий · Audit & Movement Log`} />
          <CardContent>
            <EventTimeline events={c.events} canUpload={!isWrittenOff && can(session.role, "inspection")} />
          </CardContent>
        </Card>
      </div>

      {c.notes && (
        <Card className="mt-4 border-amber-200 bg-amber-50/50 lg:mt-6">
          <CardHeader icon={<Wrench />} title="Примечания" />
          <CardContent className="text-sm whitespace-pre-line text-slate-700">{c.notes}</CardContent>
        </Card>
      )}
    </>
  );
}
