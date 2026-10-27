import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Boxes, CircleDollarSign, Flame, Gauge, MapPin, PieChart, Route, TriangleAlert, Warehouse, Wrench } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, PageHeader, Progress } from "@/components/ui/primitives";
import { BicCode, LeaseExpiryBadge, PaymentBadge } from "@/components/status-badges";
import { RegionChart, StatusChart } from "@/components/dashboard/fleet-charts";
import { prisma } from "@/lib/prisma";
import { sumMoney } from "@/lib/money";
import { computeFleetKpi } from "@/lib/domain/fleet";
import { getContainerRows } from "@/lib/queries/containers";
import { getLeaseRows, getTripRows } from "@/lib/queries/operations";
import { locodeCity, teuOf } from "@/lib/domain/constants";
import { formatDateShort, formatDays, formatPercent, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { businessToday } from "@/lib/business-time";

export const metadata: Metadata = { title: "Дашборд" };

export default async function DashboardPage() {
  const now = businessToday();
  const [containers, activeTrips, trips, leases, rows] = await Promise.all([
    prisma.container.findMany({ where: { deletedAt: null } }),
    prisma.oneWayTrip.findMany({ where: { status: "ACTIVE" } }),
    getTripRows(now),
    getLeaseRows(now),
    getContainerRows(now),
  ]);
  const kpi = computeFleetKpi(containers, activeTrips, leases, now);

  const twenty = containers.filter((c) => teuOf(c.sizeType) === 1).length;
  const hotTrips = trips
    .filter((t) => t.timing.status === "OVERDUE" || t.timing.isHot)
    .sort((a, b) => b.timing.overdueDays - a.timing.overdueDays || (a.timing.daysLeft ?? 0) - (b.timing.daysLeft ?? 0));
  const leaseAlerts = leases.filter((l) => l.metrics.needsAttention);
  const fleetAlerts = rows.filter((r) => r.needsAttention).slice(0, 8);
  const economics = {
    revenue: sumMoney(containers.map((c) => c.totalRevenueUsd)),
    book: sumMoney(containers.map((c) => c.currentBookValueUsd)),
    repairs: sumMoney(containers.map((c) => c.totalRepairCostUsd)),
    eorPending: sumMoney(containers.map((c) => c.eorAmountUsd ?? 0)),
    storagePerDay: sumMoney(containers.filter((c) => c.operationalStatus === "AVAILABLE").map((c) => c.storageRatePerDayUsd ?? 0)),
  };

  return (
    <>
      <PageHeader
        title="Дашборд парка"
        description={`Сводка на ${formatDateShort(now)} · ${kpi.totalUnits} контейнеров SOC в ${kpi.byRegion.length} регионах`}
      />

      {/* KPI */}
      <section aria-label="Ключевые показатели" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4 xl:grid-cols-6">
        <Card className="relative col-span-2 overflow-hidden border-slate-900 bg-slate-900 p-5 text-white md:col-span-4 xl:col-span-2">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-10" style={{ backgroundImage: "repeating-linear-gradient(90deg,#fff 0 3px,transparent 3px 14px)" }} aria-hidden />
          <div className="relative flex items-center gap-2 text-xs font-medium tracking-wide text-indigo-300 uppercase">
            <Boxes className="size-4" aria-hidden /> Всего в парке
          </div>
          <div className="relative mt-3 flex items-end gap-6">
            <div>
              <p className="font-mono text-4xl font-semibold tabular">{kpi.totalUnits}</p>
              <p className="text-xs text-slate-400">единиц</p>
            </div>
            <div>
              <p className="font-mono text-4xl font-semibold text-indigo-300 tabular">{kpi.totalTeu}</p>
              <p className="text-xs text-slate-400">TEU</p>
            </div>
          </div>
          <p className="relative mt-4 font-mono text-xs text-slate-400">
            20′ — {twenty} шт · 40′ — {kpi.totalUnits - twenty} шт
          </p>
        </Card>

        <KpiCard href="/containers" icon={<Gauge />} label="Утилизация парка" value={formatPercent(kpi.utilizationRate, 1)} tone="indigo">
          <Progress label="Утилизация парка" value={kpi.utilizationRate} className="mt-2" />
          <p className="mt-2">{kpi.utilizedUnits} из {kpi.totalUnits} задействованы</p>
        </KpiCard>

        <KpiCard href="/one-way" icon={<Route />} label="В One-Way" value={String(kpi.oneWay.active)} tone={kpi.oneWay.overdue ? "rose" : "indigo"}>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge tone="amber">{kpi.oneWay.hot} горят</Badge>
            <Badge tone="rose">{kpi.oneWay.overdue} просрочены</Badge>
          </div>
          <p className="mt-2">Детеншн: {formatUsd(kpi.oneWay.detentionUsd)}</p>
        </KpiCard>

        <KpiCard href="/leases" icon={<CircleDollarSign />} label="Аренда, $/мес" value={formatUsd(Math.round(kpi.lease.monthlyRevenueUsd))} tone="emerald">
          <p className="mt-1">{kpi.lease.unitsOnHire} ед. · {kpi.lease.activeContracts} договора</p>
          {kpi.lease.attention > 0 && <p className="mt-1 font-medium text-amber-700">{kpi.lease.attention} требуют внимания</p>}
        </KpiCard>

        <KpiCard href="/containers?attention=1" icon={<TriangleAlert />} label="Требуют внимания" value={String(kpi.attention.total)} tone={kpi.attention.total ? "amber" : "emerald"}>
          <ul className="mt-1 space-y-0.5">
            <li>КБК: {kpi.attention.csc}</li>
            <li>Ремонт: {kpi.attention.repair}</li>
            <li>Простой &gt;30 дн.: {kpi.attention.idle}</li>
          </ul>
        </KpiCard>
      </section>

      {/* Charts */}
      <section className="mt-4 grid grid-cols-1 gap-4 lg:mt-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader icon={<MapPin />} title="Распределение по локациям" description="Единицы и TEU по регионам дислокации" />
          <CardContent>
            <RegionChart data={kpi.byRegion} />
            <div className="mt-2 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-indigo-600" />Единицы</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-indigo-200" />TEU</span>
            </div>
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader icon={<PieChart />} title="Операционные статусы" description="Нажмите на статус, чтобы открыть реестр" />
          <CardContent>
            <StatusChart data={kpi.byStatus} total={kpi.totalUnits} />
          </CardContent>
        </Card>
      </section>

      {/* Control lists */}
      <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:mt-6 2xl:grid-cols-3">
        <Card>
          <CardHeader icon={<Flame />} title="One-Way: горящие и просроченные" action={<SeeAll href="/one-way" />} />
          <ul className="divide-y divide-slate-100">
            {hotTrips.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">Все рейсы в графике</li>}
            {hotTrips.map((t) => (
              <li key={t.id}>
                <Link href={`/one-way?focus=${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <BicCode code={t.bicCode} size="sm" />
                    <p className="truncate text-xs text-slate-500">{t.counterpartyName} · → {locodeCity(t.dropoffLocode)}</p>
                  </div>
                  {t.timing.status === "OVERDUE" ? (
                    <div className="text-right">
                      <Badge tone="rose">+{formatDays(t.timing.overdueDays)}</Badge>
                      <p className="mt-0.5 font-mono text-xs font-medium text-rose-600">{formatUsd(t.timing.detentionUsd)}</p>
                    </div>
                  ) : (
                    <Badge tone="amber">Осталось {formatDays(t.timing.daysLeft ?? 0)}</Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader icon={<CircleDollarSign />} title="Аренда: требуют внимания" action={<SeeAll href="/leases" />} />
          <ul className="divide-y divide-slate-100">
            {leaseAlerts.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">Замечаний нет</li>}
            {leaseAlerts.map((l) => (
              <li key={l.id}>
                <Link href={`/leases/${l.id}`} className="block px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900">{l.contractNumber}</span>
                    <span className="font-mono text-xs text-slate-500">{l.metrics.activeUnits} ед. × {formatUsd(l.dailyRateUsd, 2)}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{l.lesseeName}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <LeaseExpiryBadge level={l.metrics.expiryLevel} daysToEnd={l.metrics.daysToEnd} />
                    {l.paymentStatus !== "PAID" && <PaymentBadge status={l.paymentStatus} />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader icon={<Wrench />} title="Алерты парка" description="КБК, ремонт, простой на стоке" action={<SeeAll href="/containers?attention=1" />} />
          <ul className="divide-y divide-slate-100">
            {fleetAlerts.map((r) => (
              <li key={r.id}>
                <Link href={`/containers/${r.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <BicCode code={r.bicCode} size="sm" />
                    <p className="truncate text-xs text-slate-500">{locodeCity(r.currentLocode)} · {r.currentTerminal}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {r.csc.level === "EXPIRED" && <Badge tone="rose">КБК просрочена</Badge>}
                    {r.csc.level === "EXPIRING" && <Badge tone="amber">КБК {formatDays(r.csc.daysLeft)}</Badge>}
                    {r.needsRepair && <Badge tone="orange">EOR {formatUsd(r.eorAmountUsd ?? 0)}</Badge>}
                    {r.isIdleTooLong && <Badge tone="violet">Простой {formatDays(r.idleDays ?? 0)}</Badge>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* Economics */}
      <section aria-label="Экономика парка" className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:mt-6 lg:gap-4 xl:grid-cols-5">
        <EconomicsTile label="Накопленная выручка" value={formatUsd(Math.round(economics.revenue))} />
        <EconomicsTile label="Остаточная стоимость парка" value={formatUsd(economics.book)} />
        <EconomicsTile label="Затраты на ремонты" value={formatUsd(economics.repairs)} />
        <EconomicsTile label="Ремонты к согласованию (EOR)" value={formatUsd(economics.eorPending)} accent="text-orange-700" />
        <EconomicsTile label="Хранение порожних, $/сутки" value={formatUsd(economics.storagePerDay, 2)} accent="text-violet-700" icon={<Warehouse className="size-4" />} />
      </section>
    </>
  );
}

const KPI_TONES = {
  indigo: "text-indigo-600 bg-indigo-50",
  emerald: "text-emerald-600 bg-emerald-50",
  amber: "text-amber-600 bg-amber-50",
  rose: "text-rose-600 bg-rose-50",
} as const;

function KpiCard({ href, icon, label, value, tone, children }: { href: string; icon: React.ReactNode; label: string; value: string; tone: keyof typeof KPI_TONES; children?: React.ReactNode }) {
  return (
    <Link href={href} className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className={cn("rounded-md p-1.5 [&_svg]:size-4", KPI_TONES[tone])}>{icon}</span>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-slate-900 tabular sm:text-3xl">{value}</p>
      <div className="text-xs text-slate-500">{children}</div>
    </Link>
  );
}

function EconomicsTile({ label, value, accent, icon }: { label: string; value: string; accent?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</p>
      <p className={cn("mt-1 font-mono text-lg font-semibold text-slate-900 tabular", accent)}>{value}</p>
    </div>
  );
}

function SeeAll({ href }: { href: string }) {
  return (
    <Link href={href} className="flex items-center gap-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-700">
      Все <ArrowUpRight className="size-3.5" />
    </Link>
  );
}
