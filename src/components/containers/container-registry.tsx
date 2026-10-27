"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, MapPin, PackageOpen, Plus, Search, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Badge, Card, DataList, EmptyState, Input, Select } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { BicCode, CscBadge, GradeBadge, OperationalStatusBadge, TechStatusBadge } from "@/components/status-badges";
import { ExportCsvButton } from "@/components/export-csv-button";
import { REGISTRY_CSV_COLUMNS } from "@/lib/export-columns";
import { EventTimeline } from "./event-timeline";
import { ContainerForm, emptyContainerForm } from "./container-form";
import {
  CONDITION_GRADES,
  CONDITION_GRADE_LABELS,
  LOCATIONS,
  OPERATIONAL_STATUSES,
  OPERATIONAL_STATUS_LABELS,
  SIZE_TYPES,
  TECH_STATUSES,
  TECH_STATUS_LABELS,
  locodeCity,
} from "@/lib/domain/constants";
import { normalizeBic } from "@/lib/iso6346";
import { formatDate, formatDays, formatPercent, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContainerRow } from "@/lib/queries/containers";

export interface RegistryFilters {
  q: string;
  locode: string;
  size: string;
  status: string;
  grade: string;
  tech: string;
  attention: boolean;
}

type SortKey = "bicCode" | "sizeType" | "operationalStatus" | "currentLocode" | "csc" | "idle" | "roi";
type SortState = { key: SortKey; dir: "asc" | "desc" };

const EMPTY_FILTERS: RegistryFilters = { q: "", locode: "", size: "", status: "", grade: "", tech: "", attention: false };

function sortValue(row: ContainerRow, key: SortKey): string | number {
  switch (key) {
    case "csc":
      return row.csc.daysLeft;
    case "idle":
      return row.idleDays ?? -1;
    case "roi":
      return row.roi;
    default:
      return row[key];
  }
}

function matches(row: ContainerRow, f: RegistryFilters): boolean {
  const q = normalizeBic(f.q);
  if (q && !row.bicCode.includes(q)) return false;
  if (f.locode && row.currentLocode !== f.locode) return false;
  if (f.size && row.sizeType !== f.size) return false;
  if (f.status && row.operationalStatus !== f.status) return false;
  if (f.grade && row.conditionGrade !== f.grade) return false;
  if (f.tech && row.techStatus !== f.tech) return false;
  if (f.attention && !row.needsAttention) return false;
  return true;
}

interface ContainerRegistryProps {
  rows: ContainerRow[];
  initialFilters: Partial<RegistryFilters>;
}

export function ContainerRegistry({ rows, initialFilters }: ContainerRegistryProps) {
  const [filters, setFilters] = useState<RegistryFilters>({ ...EMPTY_FILTERS, ...initialFilters });
  const [sort, setSort] = useState<SortState>({ key: "bicCode", dir: "asc" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const visible = useMemo(() => {
    const filtered = rows.filter((r) => matches(r, filters));
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv))) * factor;
    });
  }, [rows, filters, sort]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const activeFilterCount = [filters.locode, filters.size, filters.status, filters.grade, filters.tech].filter(Boolean).length + (filters.attention ? 1 : 0);
  const usedLocodes = LOCATIONS.filter((l) => rows.some((r) => r.currentLocode === l.code));

  function update<K extends keyof RegistryFilters>(key: K, value: RegistryFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const filterControls = (
    <>
      <Select aria-label="Локация" value={filters.locode} onChange={(e) => update("locode", e.target.value)}>
        <option value="">Все локации</option>
        {usedLocodes.map((l) => (
          <option key={l.code} value={l.code}>{l.code} · {l.city}</option>
        ))}
      </Select>
      <Select aria-label="Типоразмер" value={filters.size} onChange={(e) => update("size", e.target.value)}>
        <option value="">Все типоразмеры</option>
        {SIZE_TYPES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </Select>
      <Select aria-label="Статус" value={filters.status} onChange={(e) => update("status", e.target.value)}>
        <option value="">Все статусы</option>
        {OPERATIONAL_STATUSES.map((s) => (
          <option key={s} value={s}>{OPERATIONAL_STATUS_LABELS[s]}</option>
        ))}
      </Select>
      <Select aria-label="Грейд" value={filters.grade} onChange={(e) => update("grade", e.target.value)}>
        <option value="">Все грейды</option>
        {CONDITION_GRADES.map((g) => (
          <option key={g} value={g}>{CONDITION_GRADE_LABELS[g]}</option>
        ))}
      </Select>
      <Select aria-label="Тех. статус" value={filters.tech} onChange={(e) => update("tech", e.target.value)}>
        <option value="">Любое тех. состояние</option>
        {TECH_STATUSES.map((t) => (
          <option key={t} value={t}>{TECH_STATUS_LABELS[t]}</option>
        ))}
      </Select>
    </>
  );

  return (
    <>
      {/* Панель поиска и фильтров */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 space-y-3 bg-slate-50/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <Input
              value={filters.q}
              onChange={(e) => update("q", e.target.value)}
              placeholder="Поиск по номеру: EXEX, 2918, 402918-4…"
              className="pl-9 font-mono"
              aria-label="Поиск по номеру контейнера"
              inputMode="search"
            />
            {filters.q && (
              <button type="button" onClick={() => update("q", "")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-700" aria-label="Очистить поиск">
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button variant="outline" size="icon" className="relative h-11 w-11 lg:hidden" onClick={() => setFiltersOpen(true)} aria-label="Фильтры">
            <SlidersHorizontal />
            {activeFilterCount > 0 && <span className="absolute -top-1 -right-1 rounded-full bg-indigo-600 px-1.5 text-[10px] leading-4 font-semibold text-white">{activeFilterCount}</span>}
          </Button>
          <Button className="h-11 lg:h-10" onClick={() => setCreateOpen(true)}>
            <Plus />
            <span className="sr-only sm:not-sr-only">Добавить</span>
          </Button>
        </div>
        <div className="hidden gap-2 lg:grid lg:grid-cols-3 xl:grid-cols-5">{filterControls}</div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => update("attention", !filters.attention)}
            aria-pressed={filters.attention}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
              filters.attention ? "bg-amber-500 text-white ring-amber-500" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300",
            )}
          >
            <TriangleAlert className="size-3.5" /> Требуют внимания
          </button>
          <span className="text-xs text-slate-500">
            Найдено: <span className="font-mono font-semibold text-slate-900">{visible.length}</span> из {rows.length}
          </span>
          {(activeFilterCount > 0 || filters.q) && (
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs font-medium text-indigo-600 hover:underline">
              Сбросить фильтры
            </button>
          )}
          <ExportCsvButton rows={visible} columns={REGISTRY_CSV_COLUMNS} filePrefix="fms-registry" className="ml-auto h-9 lg:h-9" />
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState icon={<PackageOpen />} title="Ничего не найдено" description="Измените условия поиска или сбросьте фильтры." action={<Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>Сбросить фильтры</Button>} />
        </Card>
      ) : (
        <>
          {/* ПК (≥1280px): таблица */}
          <Card className="hidden overflow-hidden xl:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <SortHeader label="Номер" sortKey="bicCode" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Тип" sortKey="sizeType" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Статус / операция" sortKey="operationalStatus" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Локация" sortKey="currentLocode" sort={sort} onSort={toggleSort} />
                    <th className="px-3 py-2.5 font-medium">Состояние</th>
                    <SortHeader label="КБК" sortKey="csc" sort={sort} onSort={toggleSort} />
                    <SortHeader label="На стоке" sortKey="idle" sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader label="ROI" sortKey="roi" sort={sort} onSort={toggleSort} align="right" />
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className={cn("cursor-pointer transition-colors hover:bg-indigo-50/40", selectedId === row.id && "bg-indigo-50/60", row.needsAttention && "border-l-2 border-l-amber-400")}
                    >
                      <td className="px-3 py-3">
                        <BicCode code={row.bicCode} />
                        <p className="text-xs text-slate-500">{row.manufactureYear} · {row.manufacturer.split(" ")[0]}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-mono font-medium">{row.sizeType}</span>
                        <p className="font-mono text-xs text-slate-500">{row.isoCode}</p>
                      </td>
                      <td className="px-3 py-3">
                        <OperationalStatusBadge status={row.operationalStatus} />
                        {row.activity && <p className="mt-1 max-w-48 truncate text-xs text-slate-500">{row.activity}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-mono text-xs font-semibold text-slate-700">{row.currentLocode}</span>
                        <p className="max-w-40 truncate text-xs text-slate-500">{row.currentTerminal}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          <GradeBadge grade={row.conditionGrade} />
                          {row.techStatus !== "SOUND" && <TechStatusBadge status={row.techStatus} />}
                        </div>
                        {row.eorAmountUsd ? <p className="mt-1 font-mono text-xs text-orange-600">EOR {formatUsd(row.eorAmountUsd)}</p> : null}
                      </td>
                      <td className="px-3 py-3">
                        {row.csc.level === "OK" ? <span className="font-mono text-xs whitespace-nowrap text-slate-500">{formatDate(row.cscPlateExpiry)}</span> : <CscBadge csc={row.csc} compact />}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {row.idleDays !== null ? (
                          <span className={cn("font-mono text-xs whitespace-nowrap", row.isIdleTooLong ? "font-semibold text-violet-700" : "text-slate-600")}>{formatDays(row.idleDays)}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className={cn("px-3 py-3 text-right font-mono text-xs font-medium", row.roi >= 0 ? "text-emerald-600" : "text-rose-600")}>{formatPercent(row.roi)}</td>
                      <td className="pr-3 text-slate-300"><ChevronRight className="size-4" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Телефон / планшет / узкий ноутбук: карточки */}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
            {visible.map((row) => (
              <li key={row.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={cn("w-full rounded-xl border bg-white p-4 text-left shadow-sm transition active:scale-[0.99]", row.needsAttention ? "border-amber-300" : "border-slate-200")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <BicCode code={row.bicCode} size="lg" />
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">{row.sizeType}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <OperationalStatusBadge status={row.operationalStatus} />
                    <GradeBadge grade={row.conditionGrade} />
                    {row.techStatus !== "SOUND" && <TechStatusBadge status={row.techStatus} />}
                  </div>
                  <p className="mt-2.5 flex items-center gap-1.5 text-sm text-slate-600">
                    <MapPin className="size-3.5 shrink-0 text-slate-500" />
                    <span className="truncate">{locodeCity(row.currentLocode)} · {row.currentTerminal}</span>
                  </p>
                  {row.activity && <p className="mt-1 truncate text-xs text-slate-500">{row.activity}</p>}
                  {(row.csc.level !== "OK" || row.isIdleTooLong || row.eorAmountUsd) && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-dashed border-slate-200 pt-2.5">
                      <CscBadge csc={row.csc} />
                      {row.isIdleTooLong && <Badge tone="violet">Простой {formatDays(row.idleDays ?? 0)}</Badge>}
                      {row.eorAmountUsd ? <Badge tone="orange">EOR {formatUsd(row.eorAmountUsd)}</Badge> : null}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Быстрый просмотр */}
      <Sheet
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected ? <BicCode code={selected.bicCode} size="lg" /> : ""}
        description={selected ? `${selected.sizeType} · ISO ${selected.isoCode} · ${selected.manufactureYear} г.` : undefined}
        footer={
          selected && (
            <Link href={`/containers/${selected.id}`} className={buttonClasses("default", "lg", "w-full")}>
              Открыть полный профиль <ChevronRight />
            </Link>
          )
        }
      >
        {selected && <QuickView row={selected} />}
      </Sheet>

      {/* Фильтры (моб.) */}
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Фильтры" footer={<Button size="lg" className="w-full" onClick={() => setFiltersOpen(false)}>Показать {visible.length}</Button>}>
        <div className="space-y-3">{filterControls}</div>
      </Sheet>

      {/* Создание */}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Новый контейнер" description="Номер проверяется по ISO 6346 с расчётом контрольной цифры" size="lg">
        <ContainerForm initial={emptyContainerForm()} onDone={() => setCreateOpen(false)} />
      </Sheet>
    </>
  );
}

function SortHeader({ label, sortKey, sort, onSort, align = "left" }: { label: string; sortKey: SortKey; sort: SortState; onSort: (k: SortKey) => void; align?: "left" | "right" }) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("px-3 py-2.5 font-medium whitespace-nowrap", align === "right" && "text-right")} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(sortKey)} className={cn("inline-flex items-center gap-1 hover:text-slate-900", active && "text-slate-900")}>
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} />
      </button>
    </th>
  );
}

function QuickView({ row }: { row: ContainerRow }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        <OperationalStatusBadge status={row.operationalStatus} />
        <TechStatusBadge status={row.techStatus} />
        <GradeBadge grade={row.conditionGrade} full />
        <CscBadge csc={row.csc} />
      </div>
      {row.activity && (
        <Link href={row.activityHref ?? "#"} className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2.5 text-sm text-indigo-800 ring-1 ring-indigo-100 hover:bg-indigo-100">
          <span className="truncate">{row.activity}</span>
          {row.tripTiming && (
            <span className={cn("ml-2 shrink-0 font-mono text-xs font-semibold", row.tripTiming.status === "OVERDUE" ? "text-rose-600" : "text-indigo-700")}>
              {row.tripTiming.status === "OVERDUE" ? `+${row.tripTiming.overdueDays} дн.` : `${row.tripTiming.daysLeft} дн.`}
            </span>
          )}
        </Link>
      )}
      <DataList
        items={[
          { label: "Локация", value: `${row.currentLocode} · ${locodeCity(row.currentLocode)}` },
          { label: "Терминал / депо", value: row.currentTerminal },
          { label: "КБК (CSC) до", value: formatDate(row.cscPlateExpiry), mono: true },
          { label: "EOR", value: row.eorAmountUsd ? formatUsd(row.eorAmountUsd) : "—", mono: true },
          { label: "На стоке", value: row.idleDays !== null ? `${formatDays(row.idleDays)} · ${formatUsd(row.storageCostUsd)}` : "—" },
          { label: "Выручка / ROI", value: `${formatUsd(Math.round(row.totalRevenueUsd))} · ${formatPercent(row.roi)}`, mono: true },
        ]}
      />
      <div>
        <h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Последние события</h3>
        <EventTimeline events={row.recentEvents} compact />
      </div>
    </div>
  );
}
