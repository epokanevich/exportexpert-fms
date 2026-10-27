"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Flame, Gavel, PackageCheck, Plus, Printer, Route, Search, TriangleAlert } from "lucide-react";
import { resolveDisputeAction } from "@/actions/one-way";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, DataList, EmptyState, Field, Input, Progress } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { BicCode, TripStatusBadge } from "@/components/status-badges";
import { useServerAction } from "@/components/use-server-action";
import { ExportCsvButton } from "@/components/export-csv-button";
import { ONE_WAY_CSV_COLUMNS } from "@/lib/export-columns";
import { GateInForm } from "./gate-in-form";
import { NewTripForm } from "./new-trip-form";
import { locodeCity } from "@/lib/domain/constants";
import { normalizeBic } from "@/lib/iso6346";
import { formatDate, formatDays, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatBic } from "@/lib/iso6346";
import type { TripRow } from "@/lib/queries/operations";
import type { IssuableContainer } from "@/lib/queries/containers";
import { sumMoney } from "@/lib/money";

type Tab = "open" | "hot" | "overdue" | "dispute" | "completed" | "all";

const TABS: { id: Tab; label: string; tone: string }[] = [
  { id: "open", label: "В работе", tone: "text-indigo-700" },
  { id: "hot", label: "Горят ≤ 5 дн.", tone: "text-amber-700" },
  { id: "overdue", label: "Просрочены", tone: "text-rose-700" },
  { id: "dispute", label: "Претензии", tone: "text-amber-700" },
  { id: "completed", label: "Завершены", tone: "text-emerald-700" },
  { id: "all", label: "Все", tone: "text-slate-700" },
];

function inTab(t: TripRow, tab: Tab): boolean {
  const s = t.timing.status;
  switch (tab) {
    case "open":
      return s === "ACTIVE" || s === "OVERDUE";
    case "hot":
      return s === "ACTIVE" && t.timing.isHot;
    case "overdue":
      return s === "OVERDUE";
    case "dispute":
      return s === "DISPUTE";
    case "completed":
      return s === "COMPLETED";
    default:
      return true;
  }
}

/** Порядок «в работе»: сначала просроченные (по убыванию просрочки), затем по остатку дней. */
function urgency(t: TripRow): number {
  if (t.timing.status === "OVERDUE") return -1000 - t.timing.overdueDays;
  if (t.timing.status === "ACTIVE") return t.timing.daysLeft ?? 0;
  return 10_000 - new Date(t.actualReturnDate ?? t.handoverDate).getTime() / 86_400_000 / 1000;
}

interface OneWayBoardProps {
  trips: TripRow[];
  issuable: IssuableContainer[];
  focusId?: string;
}

export function OneWayBoard({ trips, issuable, focusId }: OneWayBoardProps) {
  const [tab, setTab] = useState<Tab>(() => {
    const focused = trips.find((t) => t.id === focusId);
    return focused && !inTab(focused, "open") ? "all" : "open";
  });
  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState<string | null>(focusId ?? null);
  const [gateInId, setGateInId] = useState<string | null>(null);
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, trips.filter((trip) => inTab(trip, t.id)).length])) as Record<Tab, number>, [trips]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const bicNeedle = normalizeBic(q);
    return trips
      .filter((t) => inTab(t, tab))
      .filter((t) => !needle || (bicNeedle && t.bicCode.includes(bicNeedle)) || t.counterpartyName.toLowerCase().includes(needle) || t.bookingRef.toLowerCase().includes(needle))
      .sort((a, b) => urgency(a) - urgency(b));
  }, [trips, tab, q]);

  const detail = trips.find((t) => t.id === detailId) ?? null;
  const gateInTrip = trips.find((t) => t.id === gateInId) ?? null;
  const disputeTrip = trips.find((t) => t.id === disputeId) ?? null;
  const detentionTotal = sumMoney(trips.filter((t) => t.timing.status === "OVERDUE").map((t) => t.timing.detentionUsd));

  return (
    <>
      {/* Сводка */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="В работе" value={counts.open} onClick={() => setTab("open")} active={tab === "open"} />
        <SummaryTile label="Горят ≤ 5 дней" value={counts.hot} tone="amber" icon={<Flame />} onClick={() => setTab("hot")} active={tab === "hot"} />
        <SummaryTile label="Просрочены" value={counts.overdue} tone="rose" icon={<TriangleAlert />} onClick={() => setTab("overdue")} active={tab === "overdue"} />
        <SummaryTile label="Детеншн начислен" value={formatUsd(detentionTotal)} tone="rose" onClick={() => setTab("overdue")} active={false} />
      </div>

      <div className="mb-4 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Фильтр рейсов">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:min-h-9",
                tab === t.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {t.label}
              <span className={cn("rounded px-1.5 font-mono text-xs", tab === t.id ? "bg-white/20" : cn("bg-slate-100", t.tone))}>{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 2xl:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Номер, контрагент, заявка" className="pl-9" aria-label="Поиск рейса" />
          </div>
          <ExportCsvButton rows={visible} columns={ONE_WAY_CSV_COLUMNS} filePrefix={`fms-one-way-${tab}`} />
          <Button className="h-11 lg:h-10" onClick={() => setNewOpen(true)}>
            <Plus /> <span className="sr-only sm:not-sr-only">Выдать в One-Way</span>
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState icon={<Route />} title="Рейсов нет" description="В этой категории сейчас нет рейсов One-Way." />
        </Card>
      ) : (
        <>
          {/* ПК: таблица */}
          <Card className="hidden overflow-hidden xl:block">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Контейнер</th>
                  <th className="px-3 py-2.5 font-medium">Контрагент / заявка</th>
                  <th className="px-3 py-2.5 font-medium">Маршрут</th>
                  <th className="px-3 py-2.5 font-medium">Выдача → дедлайн</th>
                  <th className="w-60 px-3 py-2.5 font-medium">Свободные дни</th>
                  <th className="px-3 py-2.5 text-right font-medium">Детеншн</th>
                  <th className="px-4 py-2.5 text-right font-medium">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((t) => (
                  <tr key={t.id} className={cn("cursor-pointer hover:bg-slate-50/80", t.id === focusId && "bg-indigo-50/50", t.timing.status === "OVERDUE" && "bg-rose-50/40")} onClick={() => setDetailId(t.id)}>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailId(t.id);
                        }}
                        className="-m-1 rounded p-1 text-left focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                        aria-label={`Карточка рейса ${t.bookingRef}, контейнер ${formatBic(t.bicCode)}`}
                      >
                        <BicCode code={t.bicCode} />
                      </button>
                      <p className="font-mono text-xs text-slate-500">{t.sizeType}</p>
                    </td>
                    <td className="max-w-52 px-3 py-3">
                      <p className="truncate font-medium text-slate-900">{t.counterpartyName}</p>
                      <p className="font-mono text-xs text-slate-500">{t.bookingRef}</p>
                    </td>
                    <td className="px-3 py-3">
                      <RouteLabel from={t.pickupLocode} to={t.dropoffLocode} />
                      <p className="max-w-52 truncate text-xs text-slate-500">→ {t.dropoffTerminal}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">
                      {formatDate(t.handoverDate)}
                      <br />
                      <span className="text-slate-900">{formatDate(t.deadlineDate)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <FreeDaysMeter trip={t} showDetention={false} />
                    </td>
                    <td className={cn("px-3 py-3 text-right font-mono text-sm font-semibold", t.timing.detentionUsd > 0 ? "text-rose-600" : "text-slate-300")}>
                      {t.timing.detentionUsd > 0 ? formatUsd(t.timing.detentionUsd) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <ReleaseLink tripId={t.id} compact />
                        <TripAction trip={t} onGateIn={setGateInId} onResolve={setDisputeId} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>

          {/* Телефон / планшет: карточки */}
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden">
            {visible.map((t) => (
              <li key={t.id} className="min-w-0">
                <article className={cn("rounded-xl border bg-white shadow-sm", t.timing.status === "OVERDUE" ? "border-rose-300" : t.timing.isHot ? "border-amber-300" : "border-slate-200")}>
                  <button type="button" onClick={() => setDetailId(t.id)} className="block w-full p-4 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <BicCode code={t.bicCode} size="lg" />
                      <TripStatusBadge status={t.timing.status} />
                    </div>
                    <p className="mt-1.5 truncate text-sm font-medium text-slate-900">{t.counterpartyName}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <RouteLabel from={t.pickupLocode} to={t.dropoffLocode} />
                      <span className="font-mono text-xs text-slate-500">{t.bookingRef}</span>
                    </div>
                    <div className="mt-3">
                      <FreeDaysMeter trip={t} />
                    </div>
                  </button>
                  <div className="flex gap-2 border-t border-slate-100 p-2">
                    <ReleaseLink tripId={t.id} />
                    {(t.timing.status === "ACTIVE" || t.timing.status === "OVERDUE" || t.timing.status === "DISPUTE") && (
                      <div className="min-w-0 flex-1">
                        <TripAction trip={t} onGateIn={setGateInId} onResolve={setDisputeId} block />
                      </div>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet
        open={detail !== null}
        onClose={() => setDetailId(null)}
        title={detail ? `One-Way ${detail.bookingRef}` : ""}
        description={detail ? <BicCode code={detail.bicCode} size="sm" /> : undefined}
        footer={
          detail && (
            <div className="flex gap-2">
              <ReleaseLink tripId={detail.id} />
              <div className="min-w-0 flex-1">
                <TripAction trip={detail} onGateIn={(id) => { setDetailId(null); setGateInId(id); }} onResolve={(id) => { setDetailId(null); setDisputeId(id); }} block />
              </div>
            </div>
          )
        }
      >
        {detail && <TripDetail trip={detail} />}
      </Sheet>

      <Sheet open={gateInTrip !== null} onClose={() => setGateInId(null)} title="Возврат в депо (Gate-In)" description={gateInTrip ? <BicCode code={gateInTrip.bicCode} size="sm" /> : undefined}>
        {gateInTrip && <GateInForm trip={gateInTrip} onDone={() => setGateInId(null)} />}
      </Sheet>

      <Sheet open={disputeTrip !== null} onClose={() => setDisputeId(null)} title="Урегулирование претензии" description={disputeTrip ? `${disputeTrip.bookingRef} · ${disputeTrip.counterpartyName}` : undefined}>
        {disputeTrip && <ResolveDisputeForm trip={disputeTrip} onDone={() => setDisputeId(null)} />}
      </Sheet>

      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title="Выдача в One-Way" description="Контейнер передаётся контрагенту в точке A с обязательством сдать порожним в точке B" size="lg">
        <NewTripForm containers={issuable} onDone={() => setNewOpen(false)} />
      </Sheet>
    </>
  );
}

function SummaryTile({ label, value, tone = "slate", icon, onClick, active }: { label: string; value: number | string; tone?: "slate" | "amber" | "rose"; icon?: React.ReactNode; onClick: () => void; active: boolean }) {
  const tones = { slate: "text-slate-900", amber: "text-amber-700", rose: "text-rose-600" };
  return (
    <button type="button" onClick={onClick} className={cn("rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-slate-300 sm:p-4", active ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200")}>
      <span className={cn("flex items-center gap-1.5 text-xs text-slate-500 [&_svg]:size-3.5", tones[tone])}>
        {icon}
        <span className="text-slate-500">{label}</span>
      </span>
      <span className={cn("mt-1 block font-mono text-2xl font-semibold tabular", tones[tone])}>{value}</span>
    </button>
  );
}

function RouteLabel({ from, to }: { from: string; to: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="font-medium text-slate-700">{locodeCity(from)}</span>
      <ArrowRight className="size-3.5 text-slate-500" />
      <span className="font-medium text-slate-900">{locodeCity(to)}</span>
    </span>
  );
}

function FreeDaysMeter({ trip, showDetention = true }: { trip: TripRow; showDetention?: boolean }) {
  const { timing } = trip;
  if (timing.status === "COMPLETED" || timing.status === "DISPUTE") {
    return (
      <div className="text-xs">
        <TripStatusBadge status={timing.status} />
        <p className="mt-1 text-slate-500">
          Возврат {formatDate(trip.actualReturnDate)}
          {timing.overdueDays > 0 && <span className="text-rose-600"> · +{formatDays(timing.overdueDays)}</span>}
        </p>
      </div>
    );
  }
  const isOverdue = timing.status === "OVERDUE";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
        <span className={cn("font-semibold whitespace-nowrap", isOverdue ? "text-rose-600" : timing.isHot ? "text-amber-700" : "text-slate-700")}>
          {isOverdue ? (
            <>
              Просрочка {formatDays(timing.overdueDays)}
              {showDetention && <> → <span className="font-mono">{formatUsd(timing.detentionUsd)}</span></>}
            </>
          ) : (
            `Осталось ${formatDays(timing.daysLeft ?? 0)}`
          )}
        </span>
        <span className="font-mono text-slate-500">{trip.freeDays} св.</span>
      </div>
      <Progress label="Использовано свободных дней" value={timing.freeDaysUsedRatio} tone={isOverdue ? "rose" : timing.isHot ? "amber" : "indigo"} />
    </div>
  );
}

/** Печатный Release Order / памятка на возврат — открывается в новой вкладке. */
function ReleaseLink({ tripId, compact = false }: { tripId: string; compact?: boolean }) {
  return (
    <a
      href={`/print/one-way/${tripId}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Релиз / Памятка на возврат (печать)"
      className={buttonClasses("outline", compact ? "sm" : "lg", compact ? "px-2" : "shrink-0")}
    >
      <Printer />
      {/* На узком телефоне и в двухколоночной сетке планшета — только иконка (подпись остаётся для скринридера). */}
      <span className={compact ? "sr-only" : "sr-only xs:not-sr-only md:sr-only"}>Релиз / Памятка</span>
    </a>
  );
}

function TripAction({ trip, onGateIn, onResolve, block = false }: { trip: TripRow; onGateIn: (id: string) => void; onResolve: (id: string) => void; block?: boolean }) {
  const s = trip.timing.status;
  if (s === "ACTIVE" || s === "OVERDUE") {
    return (
      <Button size={block ? "lg" : "sm"} variant={s === "OVERDUE" ? "destructive" : "success"} className={cn(block && "w-full min-w-0")} onClick={() => onGateIn(trip.id)}>
        {/* В двухколоночной сетке планшета (md…xl) полная подпись не помещается в карточку — показываем короткую. */}
        <PackageCheck /> <span className="truncate">{block && <span className="md:hidden">Зафиксировать </span>}Gate-In</span>
      </Button>
    );
  }
  if (s === "DISPUTE") {
    return (
      <Button size={block ? "lg" : "sm"} variant="warning" className={cn(block && "w-full min-w-0")} onClick={() => onResolve(trip.id)}>
        <Gavel /> <span className="truncate">{block ? <><span className="md:hidden">Закрыть претензию</span><span className="hidden md:inline">Претензия</span></> : "Претензия"}</span>
      </Button>
    );
  }
  return null;
}

function TripDetail({ trip }: { trip: TripRow }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        <TripStatusBadge status={trip.timing.status} />
      </div>
      <FreeDaysMeter trip={trip} />
      <DataList
        items={[
          { label: "Контрагент", value: trip.counterpartyName, full: true },
          { label: "ИНН", value: trip.counterpartyInn ?? "—", mono: true },
          { label: "Контакт", value: trip.counterpartyContact ?? "—" },
          { label: "Выдача (A)", value: `${trip.pickupLocode} · ${locodeCity(trip.pickupLocode)}, ${trip.pickupTerminal}`, full: true },
          { label: "Возврат (B)", value: `${trip.dropoffLocode} · ${locodeCity(trip.dropoffLocode)}, ${trip.dropoffTerminal}`, full: true },
          { label: "Gate-Out", value: formatDate(trip.handoverDate), mono: true },
          { label: "Свободных дней", value: String(trip.freeDays), mono: true },
          { label: "Дедлайн возврата", value: formatDate(trip.deadlineDate), mono: true },
          { label: "Фактический Gate-In", value: formatDate(trip.actualReturnDate), mono: true },
          { label: "Фикс. ставка / депозит", value: formatUsd(trip.feeUsd), mono: true },
          { label: "Детеншн", value: `${formatUsd(trip.detentionRatePerDayUsd)}/сут.`, mono: true },
          { label: "Начислено детеншна", value: formatUsd(trip.timing.detentionUsd), mono: true },
          { label: "Состояние при сдаче", value: trip.returnCondition === "DAMAGED" ? `Поврежден, EOR ${formatUsd(trip.returnEorUsd ?? 0)}` : trip.returnCondition === "SOUND" ? "Исправен" : "—" },
        ]}
      />
      {trip.notes && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm whitespace-pre-line text-amber-900 ring-1 ring-amber-200">{trip.notes}</p>}
      <Link href={`/containers/${trip.containerId}`} className="inline-block text-sm font-medium text-indigo-600 hover:underline">
        Профиль контейнера →
      </Link>
    </div>
  );
}

function ResolveDisputeForm({ trip, onDone }: { trip: TripRow; onDone: () => void }) {
  const [compensationUsd, setCompensation] = useState(String(trip.returnEorUsd ?? 0));
  const [note, setNote] = useState("");
  const { run, isPending, fieldErrors } = useServerAction();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => resolveDisputeAction(trip.id, { compensationUsd, note }), onDone);
      }}
    >
      <p className="text-sm text-slate-600">
        EOR по акту: <b className="font-mono">{formatUsd(trip.returnEorUsd ?? 0)}</b>. Укажите сумму, которую контрагент компенсировал.
      </p>
      <Field label="Компенсация, $" htmlFor="rd-sum" error={fieldErrors.compensationUsd}>
        <Input id="rd-sum" type="number" inputMode="decimal" step="0.01" min={0} value={compensationUsd} onChange={(e) => setCompensation(e.target.value)} />
      </Field>
      <Field label="Комментарий" htmlFor="rd-note" error={fieldErrors.note}>
        <Input id="rd-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Номер платёжного поручения" />
      </Field>
      <Button type="submit" size="lg" className="w-full" variant="warning" loading={isPending}>
        <Gavel /> Закрыть претензию
      </Button>
    </form>
  );
}
