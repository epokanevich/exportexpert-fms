"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye, FileSpreadsheet, FileUp, MapPin, PackageOpen, Plus, Search, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Badge, Card, DataList, EmptyState, Input, Select } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { BicCode, CscBadge, GradeBadge, OperationalStatusBadge, TechStatusBadge } from "@/components/status-badges";
import { EventTimeline } from "./event-timeline";
import { ContainerForm, emptyContainerForm } from "./container-form";
import { ImportSheet } from "./import-sheet";
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
import { formatBic } from "@/lib/iso6346";
import { formatDate, formatDays, formatNumber, formatPercent, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContainerRow } from "@/lib/queries/containers";
import { DEFAULT_REGISTRY_QUERY, REGISTRY_PAGE_SIZE, registryQueryString, type RegistryQuery, type SortKey } from "@/lib/queries/registry-params";

const SEARCH_DEBOUNCE_MS = 300;

interface ContainerRegistryProps {
  rows: ContainerRow[];
  total: number;
  pageCount: number;
  query: RegistryQuery;
}

/**
 * Реестр (4.4): фильтры, сортировка и страница — в URL, выборка и пагинация — на сервере (pg_trgm),
 * поэтому реестр работает и при тысячах единиц. Строки доступны с клавиатуры (D-22).
 */
export function ContainerRegistry({ rows, total, pageCount, query }: ContainerRegistryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  function navigate(next: Partial<RegistryQuery>, resetPage = true) {
    const merged = { ...query, ...next, ...(resetPage ? { page: 1 } : {}) };
    startTransition(() => router.replace(`${pathname}${registryQueryString(merged)}`, { scroll: false }));
  }

  // Актуальный query для отложенного поиска: фильтр, выбранный во время ожидания, не откатывается (review HIGH).
  const latestQuery = useRef(query);
  useEffect(() => {
    latestQuery.current = query;
  }, [query]);

  // Поиск по номеру — с задержкой, чтобы не дёргать сервер на каждую букву.
  useEffect(() => {
    if (search.replace(/[\s-]/g, "").toUpperCase() === latestQuery.current.q) return;
    const id = setTimeout(() => {
      const next = { ...latestQuery.current, q: search, page: 1 };
      startTransition(() => router.replace(`${pathname}${registryQueryString(next)}`, { scroll: false }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search, pathname, router]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const activeFilterCount = [query.locode, query.size, query.status, query.grade, query.tech].filter(Boolean).length + (query.attention ? 1 : 0);
  const from = total === 0 ? 0 : (query.page - 1) * REGISTRY_PAGE_SIZE + 1;
  const to = Math.min(total, query.page * REGISTRY_PAGE_SIZE);
  const exportHref = `/api/export/registry${registryQueryString({ ...query, page: 1 })}`;

  function toggleSort(key: SortKey) {
    navigate({ sort: key, dir: query.sort === key && query.dir === "asc" ? "desc" : "asc" });
  }

  const filterControls = (
    <>
      <Select id="flt-locode" name="locode" aria-label="Локация" value={query.locode} onChange={(e) => navigate({ locode: e.target.value })}>
        <option value="">Все локации</option>
        {LOCATIONS.map((l) => (
          <option key={l.code} value={l.code}>{l.code} · {l.city}</option>
        ))}
      </Select>
      <Select id="flt-size" name="size" aria-label="Типоразмер" value={query.size} onChange={(e) => navigate({ size: e.target.value })}>
        <option value="">Все типоразмеры</option>
        {SIZE_TYPES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </Select>
      <Select id="flt-status" name="status" aria-label="Статус" value={query.status} onChange={(e) => navigate({ status: e.target.value })}>
        <option value="">Все статусы (без списанных)</option>
        {OPERATIONAL_STATUSES.map((s) => (
          <option key={s} value={s}>{s === "WRITTEN_OFF" ? "Списанные" : OPERATIONAL_STATUS_LABELS[s]}</option>
        ))}
      </Select>
      <Select id="flt-grade" name="grade" aria-label="Грейд" value={query.grade} onChange={(e) => navigate({ grade: e.target.value })}>
        <option value="">Все грейды</option>
        {CONDITION_GRADES.map((g) => (
          <option key={g} value={g}>{CONDITION_GRADE_LABELS[g]}</option>
        ))}
      </Select>
      <Select id="flt-tech" name="tech" aria-label="Тех. статус" value={query.tech} onChange={(e) => navigate({ tech: e.target.value })}>
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
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <Input
              id="registry-search"
              name="q"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по номеру: EXPU, 2918, 402918-4…"
              className="h-11 pl-9 font-mono lg:h-10"
              aria-label="Поиск по номеру контейнера"
              inputMode="search"
              autoComplete="off"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded text-slate-500 hover:text-slate-700 lg:size-9" aria-label="Очистить поиск">
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button variant="outline" size="icon" className="relative size-11 lg:hidden" onClick={() => setFiltersOpen(true)} aria-label="Фильтры">
            <SlidersHorizontal />
            {activeFilterCount > 0 && <span className="absolute -top-1 -right-1 rounded-full bg-indigo-600 px-1.5 text-[10px] leading-4 font-semibold text-white">{activeFilterCount}</span>}
          </Button>
          <Button variant="outline" className="h-11 lg:h-10" onClick={() => setImportOpen(true)} title="Загрузить парк из CSV (Excel)" aria-label="Импорт из CSV">
            <FileUp className="text-indigo-600" />
            <span className="sr-only sm:not-sr-only">Импорт</span>
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
            onClick={() => navigate({ attention: !query.attention })}
            aria-pressed={query.attention}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 transition-colors lg:min-h-8",
              query.attention ? "bg-amber-500 text-white ring-amber-500" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300",
            )}
          >
            <TriangleAlert className="size-3.5" aria-hidden /> Требуют внимания
          </button>
          <span className="text-xs text-slate-500" aria-live="polite">
            {isPending ? "Загрузка…" : <>Найдено: <span className="font-mono font-semibold text-slate-900">{formatNumber(total)}</span></>}
          </span>
          {(activeFilterCount > 0 || query.q) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                navigate({ ...DEFAULT_REGISTRY_QUERY });
              }}
              className="inline-flex min-h-11 items-center px-1 text-xs font-medium text-indigo-600 hover:underline lg:min-h-8"
            >
              Сбросить фильтры
            </button>
          )}
          <a href={exportHref} download className={buttonClasses("outline", "md", "ml-auto h-11 lg:h-9")} aria-label="Выгрузить выборку в Excel (CSV)" title="Скачать всю выборку по текущим фильтрам в CSV (Excel)">
            <FileSpreadsheet className="text-emerald-600" aria-hidden />
            <span className="hidden sm:inline">Excel / CSV</span>
          </a>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PackageOpen />}
            title={query.status === "WRITTEN_OFF" ? "Списанных контейнеров нет" : "Ничего не найдено"}
            description="Измените условия поиска или сбросьте фильтры."
            action={<Button variant="outline" onClick={() => { setSearch(""); navigate({ ...DEFAULT_REGISTRY_QUERY }); }}>Сбросить фильтры</Button>}
          />
        </Card>
      ) : (
        <div className={cn("transition-opacity", isPending && "opacity-60")} aria-busy={isPending}>
          {/* ПК (≥1280px): таблица */}
          <Card className="hidden overflow-hidden xl:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Реестр контейнеров. Кнопка с номером открывает быстрый просмотр, стрелка — полный профиль.</caption>
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <SortHeader label="Номер" sortKey="bicCode" query={query} onSort={toggleSort} />
                    <SortHeader label="Тип" sortKey="sizeType" query={query} onSort={toggleSort} />
                    <SortHeader label="Статус / операция" sortKey="operationalStatus" query={query} onSort={toggleSort} />
                    <SortHeader label="Локация" sortKey="currentLocode" query={query} onSort={toggleSort} />
                    <th scope="col" className="px-3 py-2.5 font-medium">Состояние</th>
                    <SortHeader label="КБК" sortKey="csc" query={query} onSort={toggleSort} />
                    <SortHeader label="На стоке" sortKey="idle" query={query} onSort={toggleSort} align="right" />
                    <SortHeader label="ROI" sortKey="roi" query={query} onSort={toggleSort} align="right" />
                    <th scope="col" className="w-12"><span className="sr-only">Профиль</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className={cn("cursor-pointer transition-colors hover:bg-indigo-50/40 focus-within:bg-indigo-50/40", selectedId === row.id && "bg-indigo-50/60", row.needsAttention && "border-l-2 border-l-amber-400")}
                    >
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(row.id);
                          }}
                          className="-m-1 rounded p-1 text-left focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                          aria-label={`Быстрый просмотр ${formatBic(row.bicCode)}`}
                        >
                          <BicCode code={row.bicCode} />
                        </button>
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
                        {row.eorAmountUsd ? <p className="mt-1 font-mono text-xs text-orange-700">EOR {formatUsd(row.eorAmountUsd)}</p> : null}
                      </td>
                      <td className="px-3 py-3">
                        {row.csc.level === "OK" ? <span className="font-mono text-xs whitespace-nowrap text-slate-500">{formatDate(row.cscPlateExpiry)}</span> : <CscBadge csc={row.csc} compact />}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {row.idleDays !== null ? (
                          <span className={cn("font-mono text-xs whitespace-nowrap", row.isIdleTooLong ? "font-semibold text-violet-700" : "text-slate-600")}>{formatDays(row.idleDays)}</span>
                        ) : (
                          <span className="text-slate-300" aria-label="нет данных">—</span>
                        )}
                      </td>
                      <td className={cn("px-3 py-3 text-right font-mono text-xs font-medium", row.roi >= 0 ? "text-emerald-700" : "text-rose-700")}>{formatPercent(row.roi)}</td>
                      <td className="pr-2">
                        <Link
                          href={`/containers/${row.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex size-9 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                          aria-label={`Профиль ${formatBic(row.bicCode)}`}
                        >
                          <ChevronRight className="size-4" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Телефон / планшет / узкий ноутбук: карточки */}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
            {rows.map((row) => (
              <li key={row.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  aria-label={`Быстрый просмотр ${formatBic(row.bicCode)}`}
                  className={cn("w-full rounded-xl border bg-white p-4 text-left shadow-sm transition active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none", row.needsAttention ? "border-amber-300" : "border-slate-200")}
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
                    <MapPin className="size-3.5 shrink-0 text-slate-500" aria-hidden />
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

          {pageCount > 1 && (
            <nav aria-label="Страницы реестра" className="mt-4 flex items-center justify-between gap-2 text-sm">
              <PageLink query={query} page={query.page - 1} disabled={query.page <= 1} label="Предыдущая страница">
                <ChevronLeft aria-hidden /> <span className="hidden sm:inline">Назад</span>
              </PageLink>
              <span className="text-xs text-slate-500">
                {formatNumber(from)}–{formatNumber(to)} из {formatNumber(total)} · стр. {query.page} из {pageCount}
              </span>
              <PageLink query={query} page={query.page + 1} disabled={query.page >= pageCount} label="Следующая страница">
                <span className="hidden sm:inline">Вперёд</span> <ChevronRight aria-hidden />
              </PageLink>
            </nav>
          )}
        </div>
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
              Открыть полный профиль <ChevronRight aria-hidden />
            </Link>
          )
        }
      >
        {selected && <QuickView row={selected} />}
      </Sheet>

      {/* Фильтры (моб.) */}
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Фильтры" footer={<Button size="lg" className="w-full" onClick={() => setFiltersOpen(false)}>Показать {formatNumber(total)}</Button>}>
        <div className="space-y-3">{filterControls}</div>
      </Sheet>

      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />

      {/* Создание */}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Новый контейнер" description="Номер проверяется по ISO 6346 с расчётом контрольной цифры" size="lg">
        <ContainerForm initial={emptyContainerForm()} onDone={() => setCreateOpen(false)} />
      </Sheet>
    </>
  );
}

function PageLink({ query, page, disabled, label, children }: { query: RegistryQuery; page: number; disabled: boolean; label: string; children: React.ReactNode }) {
  const cls = buttonClasses("outline", "md", "h-11 lg:h-10");
  if (disabled) {
    return (
      <span className={cn(cls, "pointer-events-none opacity-50")} aria-disabled="true" aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link href={`/containers${registryQueryString({ ...query, page })}`} scroll={false} className={cls} aria-label={label}>
      {children}
    </Link>
  );
}

function SortHeader({ label, sortKey, query, onSort, align = "left" }: { label: string; sortKey: SortKey; query: RegistryQuery; onSort: (k: SortKey) => void; align?: "left" | "right" }) {
  const active = query.sort === sortKey;
  const Icon = !active ? ArrowUpDown : query.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={cn("px-3 py-2.5 font-medium whitespace-nowrap", align === "right" && "text-right")} aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(sortKey)} className={cn("inline-flex min-h-8 items-center gap-1 hover:text-slate-900", active && "text-slate-900")}>
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
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
      {row.activity && row.activityHref && (
        <Link href={row.activityHref} className="flex min-h-11 items-center justify-between rounded-lg bg-indigo-50 px-3 py-2.5 text-sm text-indigo-800 ring-1 ring-indigo-100 hover:bg-indigo-100">
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
          { label: "Выручка / ROI", value: `${formatUsd(row.totalRevenueUsd)} · ${formatPercent(row.roi)}`, mono: true },
        ]}
      />
      <div>
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          <Eye className="size-3.5" aria-hidden /> Последние события
        </h3>
        <EventTimeline events={row.recentEvents} compact />
      </div>
    </div>
  );
}
