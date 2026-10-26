"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, FileText, Plus, Repeat, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Input } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { LeaseExpiryBadge, PaymentBadge } from "@/components/status-badges";
import { ExportCsvButton } from "@/components/export-csv-button";
import { LEASE_CSV_COLUMNS } from "@/lib/export-columns";
import { NewLeaseForm } from "./lease-forms";
import { formatDate, formatUsd } from "@/lib/format";
import { locodeCity } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";
import type { LeaseRow } from "@/lib/queries/operations";
import type { IssuableContainer } from "@/lib/queries/containers";

type Tab = "active" | "attention" | "expiring" | "debt" | "completed";

const TABS: { id: Tab; label: string }[] = [
  { id: "active", label: "Действующие" },
  { id: "attention", label: "Требуют внимания" },
  { id: "expiring", label: "Истекают ≤ 30 дн." },
  { id: "debt", label: "Задолженность" },
  { id: "completed", label: "Закрытые" },
];

function inTab(l: LeaseRow, tab: Tab): boolean {
  const active = l.status === "ACTIVE";
  switch (tab) {
    case "active":
      return active;
    case "attention":
      return active && l.metrics.needsAttention;
    case "expiring":
      return active && ["CRITICAL", "WARNING", "EXPIRED"].includes(l.metrics.expiryLevel);
    case "debt":
      return active && l.paymentStatus === "OVERDUE";
    case "completed":
      return !active;
  }
}

export function LeaseList({ leases, issuable }: { leases: LeaseRow[]; issuable: IssuableContainer[] }) {
  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const active = leases.filter((l) => l.status === "ACTIVE");
  const totals = {
    units: active.reduce((s, l) => s + l.metrics.activeUnits, 0),
    monthly: active.reduce((s, l) => s + l.metrics.monthlyRunRateUsd, 0),
    accruedMonth: active.reduce((s, l) => s + l.metrics.accruedThisMonthUsd, 0),
    accruedTotal: leases.reduce((s, l) => s + l.metrics.accruedTotalUsd, 0),
  };

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leases.filter((l) => inTab(l, tab)).filter((l) => !needle || l.contractNumber.toLowerCase().includes(needle) || l.lesseeName.toLowerCase().includes(needle));
  }, [leases, tab, q]);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Единиц в аренде" value={String(totals.units)} sub={`${active.length} действующих договоров`} />
        <Tile label="Доход в месяц (run-rate)" value={formatUsd(Math.round(totals.monthly))} sub="единицы × Per Diem × дни месяца" accent />
        <Tile label="Начислено в этом месяце" value={formatUsd(Math.round(totals.accruedMonth))} sub="с 1-го числа по сегодня" />
        <Tile label="Начислено за всё время" value={formatUsd(Math.round(totals.accruedTotal))} sub="по всем договорам" />
      </div>

      <div className="mb-4 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist">
          {TABS.map((t) => {
            const count = leases.filter((l) => inTab(l, t.id)).length;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium", tab === t.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}
              >
                {t.label}
                <span className={cn("rounded px-1.5 font-mono text-xs", tab === t.id ? "bg-white/20" : "bg-slate-100")}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 2xl:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Договор или арендатор" className="pl-9" aria-label="Поиск договора" />
          </div>
          <ExportCsvButton rows={visible} columns={LEASE_CSV_COLUMNS} filePrefix={`fms-leases-${tab}`} />
          <Button className="h-11 lg:h-10" onClick={() => setNewOpen(true)}>
            <Plus /> <span className="hidden sm:inline">Новый договор</span>
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState icon={<FileText />} title="Договоров нет" description="В этой категории нет договоров аренды." />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden xl:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Договор / арендатор</th>
                  <th className="px-3 py-2.5 font-medium">Срок</th>
                  <th className="px-3 py-2.5 text-right font-medium">Ед.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Per Diem</th>
                  <th className="px-3 py-2.5 text-right font-medium">За месяц</th>
                  <th className="px-3 py-2.5 text-right font-medium">За весь срок</th>
                  <th className="px-3 py-2.5 font-medium">Оплата</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((l) => (
                  <tr key={l.id} className="group hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <Link href={`/leases/${l.id}`} className="block">
                        <span className="font-mono font-semibold text-slate-900 group-hover:text-indigo-700">{l.contractNumber}</span>
                        {l.autoRenewal && <Repeat className="ml-1.5 inline size-3.5 text-indigo-500" aria-label="Автопролонгация" />}
                        <p className="text-slate-600">{l.lesseeName}</p>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-mono text-xs text-slate-600">{formatDate(l.startDate)} — {formatDate(l.endDate)}</p>
                      <div className="mt-1"><LeaseExpiryBadge level={l.metrics.expiryLevel} daysToEnd={l.metrics.daysToEnd} /></div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{l.metrics.activeUnits}<span className="text-slate-400">/{l.metrics.totalUnits}</span></td>
                    <td className="px-3 py-3 text-right font-mono">{formatUsd(l.dailyRateUsd, 2)}</td>
                    <td className="px-3 py-3 text-right font-mono">{formatUsd(Math.round(l.metrics.accruedThisMonthUsd))}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold">{formatUsd(Math.round(l.metrics.accruedTotalUsd))}</td>
                    <td className="px-3 py-3"><PaymentBadge status={l.paymentStatus} /></td>
                    <td className="pr-3">
                      <Link href={`/leases/${l.id}`} aria-label={`Открыть ${l.contractNumber}`} className="text-slate-300 group-hover:text-slate-500"><ChevronRight className="size-4" /></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden">
            {visible.map((l) => (
              <li key={l.id} className="min-w-0">
                <Link href={`/leases/${l.id}`} className={cn("block rounded-xl border bg-white p-4 shadow-sm active:scale-[0.99]", l.metrics.needsAttention ? "border-amber-300" : "border-slate-200")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-base font-semibold text-slate-900">{l.contractNumber}</p>
                      <p className="truncate text-sm text-slate-600">{l.lesseeName}</p>
                    </div>
                    <PaymentBadge status={l.paymentStatus} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2.5 text-center">
                    <Metric label="Ед." value={`${l.metrics.activeUnits}`} />
                    <Metric label="Per Diem" value={formatUsd(l.dailyRateUsd, 2)} />
                    <Metric label="За месяц" value={formatUsd(Math.round(l.metrics.accruedThisMonthUsd))} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span className="font-mono">до {formatDate(l.endDate)}</span>
                    <LeaseExpiryBadge level={l.metrics.expiryLevel} daysToEnd={l.metrics.daysToEnd} />
                    <span className="ml-auto">Возврат: {l.allowedReturnLocodes.map(locodeCity).join(", ")}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title="Новый договор аренды" description="Long-Term Lease: пакет контейнеров по суточной ставке Per Diem" size="lg">
        <NewLeaseForm containers={issuable} onDone={() => setNewOpen(false)} />
      </Sheet>
    </>
  );
}

function Tile({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3 shadow-sm sm:p-4", accent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white")}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("mt-1 font-mono text-xl font-semibold tabular sm:text-2xl", accent ? "text-emerald-700" : "text-slate-900")}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="font-mono text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
