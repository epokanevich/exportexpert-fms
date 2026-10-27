"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, ClipboardCheck, FileText, MapPin, PackageCheck, ScanLine, Search, ShieldCheck, X } from "lucide-react";
import { Card, EmptyState, Input } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { BicCode, CscBadge, GradeBadge, OperationalStatusBadge, TechStatusBadge } from "@/components/status-badges";
import { EventTimeline } from "@/components/containers/event-timeline";
import { GateInForm, type GateInTrip } from "@/components/one-way/gate-in-form";
import { CscRenewForm, GateInHereForm, GateOutForm, InspectionForm } from "./inspector-forms";
import { TECH_STATUSES, TECH_STATUS_LABELS, locodeCity, type TechStatus } from "@/lib/domain/constants";
import { normalizeBic } from "@/lib/iso6346";
import { formatDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContainerRow } from "@/lib/queries/containers";

type ActionSheet = { kind: "inspect"; tech?: TechStatus } | { kind: "gateIn" } | { kind: "gateOut" } | { kind: "csc" } | { kind: "oneWayReturn" };

interface TerminalInspectorProps {
  rows: ContainerRow[];
  tripsByContainer: Record<string, GateInTrip>;
  leaseByContainer: Record<string, { id: string; contractNumber: string }>;
  initialId?: string;
  initialQuery?: string;
}

const MAX_RESULTS = 8;

const SEARCH_DEBOUNCE_MS = 250;

export function TerminalInspector({ rows, tripsByContainer, leaseByContainer, initialId, initialQuery = "" }: TerminalInspectorProps) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const [action, setAction] = useState<ActionSheet | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const needle = normalizeBic(q);
    if (!needle) return [];
    return rows.filter((r) => r.bicCode.includes(needle)).slice(0, MAX_RESULTS);
  }, [rows, q]);

  // Совпадения ищет сервер: номер уходит в URL (?q=), страница возвращает только найденные единицы.
  useEffect(() => {
    const needle = normalizeBic(q);
    if (needle === normalizeBic(initialQuery)) return;
    const id = setTimeout(() => router.replace(needle ? `/inspector?q=${encodeURIComponent(needle)}` : "/inspector", { scroll: false }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [q, initialQuery, router]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const closeAction = () => setAction(null);

  if (selected) {
    const trip = tripsByContainer[selected.id];
    const lease = leaseByContainer[selected.id];
    const onSite = selected.operationalStatus === "AVAILABLE" || selected.operationalStatus === "MAINTENANCE";
    const canGateOut = selected.operationalStatus === "AVAILABLE" && selected.techStatus === "SOUND" && selected.csc.level !== "EXPIRED";

    return (
      <div className="mx-auto max-w-2xl">
        <button type="button" onClick={() => { setSelectedId(null); setTimeout(() => inputRef.current?.focus(), 50); }} className="mb-3 inline-flex h-11 items-center gap-1.5 text-sm font-medium text-slate-600">
          <ArrowLeft className="size-4" /> Другой контейнер
        </button>

        <Card className="overflow-hidden">
          <div className="bg-slate-900 p-5 text-white">
            <p className="font-mono text-xs tracking-widest text-indigo-300 uppercase">{selected.sizeType} · ISO {selected.isoCode}</p>
            <BicCode code={selected.bicCode} size="xl" className="text-white [&>span:last-child]:bg-indigo-500" />
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-300">
              <MapPin className="size-4" /> {locodeCity(selected.currentLocode)} · {selected.currentTerminal}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 p-4">
            <OperationalStatusBadge status={selected.operationalStatus} />
            <TechStatusBadge status={selected.techStatus} />
            <GradeBadge grade={selected.conditionGrade} full />
            <CscBadge csc={selected.csc} />
            {selected.idleDays !== null && <span className="text-xs text-slate-500">На стоке {formatDays(selected.idleDays)}</span>}
          </div>
        </Card>

        <h2 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Быстрая смена тех. статуса</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TECH_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setAction({ kind: "inspect", tech: s })}
              aria-pressed={selected.techStatus === s}
              className={cn(
                "flex h-14 flex-col items-center justify-center rounded-xl border-2 px-1 text-sm font-semibold leading-tight transition active:scale-95",
                selected.techStatus === s ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700",
              )}
            >
              {TECH_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <h2 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Действия на терминале</h2>
        <div className="grid grid-cols-2 gap-2">
          <BigAction icon={<ClipboardCheck />} label="Акт осмотра" hint="Грейд, повреждения, EOR" onClick={() => setAction({ kind: "inspect" })} tone="indigo" />
          {trip ? (
            <BigAction icon={<PackageCheck />} label="Возврат One-Way" hint={trip.bookingRef} onClick={() => setAction({ kind: "oneWayReturn" })} tone="emerald" />
          ) : lease ? (
            <Link href={`/leases/${lease.id}`} className="contents">
              <BigAction icon={<FileText />} label="Off-Hire" hint={lease.contractNumber} tone="violet" />
            </Link>
          ) : (
            <BigAction icon={<ArrowDownToLine />} label="Gate-In" hint="Принять на терминал" onClick={() => setAction({ kind: "gateIn" })} tone="emerald" />
          )}
          <BigAction
            icon={<ArrowUpFromLine />}
            label="Gate-Out"
            hint={canGateOut ? "Собственный рейс" : selected.csc.level === "EXPIRED" ? "КБК просрочена" : "Недоступно"}
            onClick={() => setAction({ kind: "gateOut" })}
            disabled={!canGateOut}
            tone="sky"
          />
          <BigAction icon={<ShieldCheck />} label="Продлить КБК" hint="ACEP / CSC" onClick={() => setAction({ kind: "csc" })} tone="teal" />
        </div>
        {!onSite && !trip && !lease && (
          <p className="mt-2 text-xs text-slate-500">Контейнер в пути — после прибытия зафиксируйте Gate-In.</p>
        )}

        <Card className="mt-5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Последние события</h2>
            <Link href={`/containers/${selected.id}`} className="text-xs font-medium text-indigo-600">Полный профиль →</Link>
          </div>
          <EventTimeline events={selected.recentEvents} compact />
        </Card>

        <Sheet open={action?.kind === "inspect"} onClose={closeAction} title="Акт осмотра" description={<BicCode code={selected.bicCode} size="sm" />}>
          {action?.kind === "inspect" && <InspectionForm key={action.tech ?? "x"} row={selected} presetTech={action.tech} onDone={closeAction} />}
        </Sheet>
        <Sheet open={action?.kind === "gateIn"} onClose={closeAction} title="Gate-In на терминал">
          <GateInHereForm row={selected} onDone={closeAction} />
        </Sheet>
        <Sheet open={action?.kind === "gateOut"} onClose={closeAction} title="Gate-Out">
          <GateOutForm row={selected} onDone={closeAction} />
        </Sheet>
        <Sheet open={action?.kind === "csc"} onClose={closeAction} title="Освидетельствование КБК (CSC)">
          <CscRenewForm row={selected} onDone={closeAction} />
        </Sheet>
        <Sheet open={action?.kind === "oneWayReturn"} onClose={closeAction} title="Возврат по One-Way (Gate-In)" description={trip?.bookingRef}>
          {trip && <GateInForm trip={trip} onDone={closeAction} />}
        </Sheet>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Номер или последние цифры"
          className="h-16 rounded-2xl pr-12 pl-12 font-mono text-xl tracking-wide uppercase shadow-md lg:h-16"
          aria-label="Номер контейнера"
          autoFocus
          autoComplete="off"
          inputMode="text"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-slate-400" aria-label="Очистить поиск">
            <X className="size-5" />
          </button>
        )}
      </div>

      {q === "" ? (
        <Card className="mt-4">
          <EmptyState icon={<ScanLine />} title="Найдите контейнер по номеру" description="Достаточно 3–4 последних цифр, например 2918. Пробелы и дефисы можно не вводить." />
        </Card>
      ) : results.length === 0 ? (
        <Card className="mt-4">
          <EmptyState title="Контейнер не найден" description="Проверьте номер или найдите его в реестре." />
        </Card>
      ) : (
        <ul className="mt-4 space-y-2">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setSelectedId(r.id)} className="flex min-h-20 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm active:scale-[0.99] active:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <BicCode code={r.bicCode} size="lg" />
                  <p className="mt-1 truncate text-sm text-slate-500">{r.sizeType} · {locodeCity(r.currentLocode)} · {r.currentTerminal}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <OperationalStatusBadge status={r.operationalStatus} />
                  {r.techStatus !== "SOUND" && <TechStatusBadge status={r.techStatus} />}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ACTION_TONES = {
  indigo: "bg-indigo-50 text-indigo-700",
  emerald: "bg-emerald-50 text-emerald-700",
  sky: "bg-sky-50 text-sky-700",
  teal: "bg-teal-50 text-teal-700",
  violet: "bg-violet-50 text-violet-700",
} as const;

function BigAction({ icon, label, hint, onClick, disabled = false, tone }: { icon: React.ReactNode; label: string; hint: string; onClick?: () => void; disabled?: boolean; tone: keyof typeof ACTION_TONES }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-24 flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition active:scale-[0.98] disabled:opacity-40"
    >
      <span className={cn("rounded-lg p-2 [&_svg]:size-5", ACTION_TONES[tone])}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        <span className="block truncate text-xs text-slate-500">{hint}</span>
      </span>
    </button>
  );
}
