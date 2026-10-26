import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, ClipboardCheck, Repeat } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, DataList } from "@/components/ui/primitives";
import { LeaseExpiryBadge, PaymentBadge } from "@/components/status-badges";
import { LeaseActions, LeaseCalculator } from "@/components/leases/lease-detail-client";
import { getLeaseRow } from "@/lib/queries/operations";
import { SURVEY_STATUS_LABELS, locodeCity } from "@/lib/domain/constants";
import { formatDate, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const lease = await getLeaseRow(id, new Date());
  return { title: lease ? `Договор ${lease.contractNumber}` : "Договор не найден" };
}

export default async function LeaseDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const lease = await getLeaseRow(id, new Date());
  if (!lease) notFound();
  const { metrics } = lease;

  return (
    <>
      <Link href="/leases" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Долгосрочная аренда
      </Link>

      <Card className="relative mb-4 overflow-hidden lg:mb-6">
        <div className={cn("absolute inset-y-0 left-0 w-1.5", lease.status === "ACTIVE" ? "bg-violet-600" : "bg-slate-300")} aria-hidden />
        <div className="flex flex-col gap-4 p-5 pl-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs tracking-widest text-slate-400 uppercase">Long-Term Lease · Per Diem</p>
            <h1 className="mt-1 font-mono text-2xl font-semibold text-slate-900 sm:text-3xl">{lease.contractNumber}</h1>
            <p className="mt-0.5 text-slate-600">{lease.lesseeName}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {lease.status === "ACTIVE" ? <Badge tone="violet" dot>Действует</Badge> : <Badge tone="slate">Закрыт</Badge>}
              <PaymentBadge status={lease.paymentStatus} />
              <LeaseExpiryBadge level={metrics.expiryLevel} daysToEnd={metrics.daysToEnd} />
              {lease.autoRenewal && <Badge tone="indigo"><Repeat /> Автопролонгация</Badge>}
            </div>
          </div>
          <LeaseActions lease={lease} />
        </div>
        <div className="grid grid-cols-2 border-t border-slate-100 sm:grid-cols-4">
          <Stat label="Единиц на руках" value={`${metrics.activeUnits} / ${metrics.totalUnits}`} />
          <Stat label="Per Diem" value={`${formatUsd(lease.dailyRateUsd, 2)}/сут.`} />
          <Stat label="Начислено за месяц" value={formatUsd(Math.round(metrics.accruedThisMonthUsd))} />
          <Stat label="Начислено за срок" value={formatUsd(Math.round(metrics.accruedTotalUsd))} strong />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-5">
        <div className="space-y-4 lg:space-y-6 xl:col-span-2">
          <Card>
            <CardHeader icon={<Building2 />} title="Условия договора" />
            <CardContent>
              <DataList
                items={[
                  { label: "Арендатор", value: lease.lesseeName, full: true },
                  { label: "ИНН", value: lease.lesseeInn ?? "—", mono: true },
                  { label: "Контактное лицо", value: lease.contactPerson },
                  { label: "Телефон", value: lease.contactPhone ?? "—" },
                  { label: "Email", value: lease.contactEmail ?? "—" },
                  { label: "On-Hire", value: formatDate(lease.startDate), mono: true },
                  { label: "Плановый Off-Hire", value: formatDate(lease.endDate), mono: true },
                  { label: "Валюта", value: lease.currency },
                  { label: "Депозит", value: formatUsd(lease.depositUsd), mono: true },
                  { label: "Доход в месяц (run-rate)", value: formatUsd(Math.round(metrics.monthlyRunRateUsd)), mono: true },
                  { label: "Разрешённые регионы возврата", value: lease.allowedReturnLocodes.map((c) => `${c} · ${locodeCity(c)}`).join(", "), full: true },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader icon={<ClipboardCheck />} title="Акты осмотра" />
            <CardContent>
              <DataList
                items={[
                  { label: "On-Hire Survey", value: SURVEY_STATUS_LABELS[lease.onHireSurvey] ?? lease.onHireSurvey },
                  { label: "Off-Hire Survey", value: SURVEY_STATUS_LABELS[lease.offHireSurvey] ?? lease.offHireSurvey },
                ]}
              />
            </CardContent>
          </Card>
          {lease.notes && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="text-sm text-slate-700">{lease.notes}</CardContent>
            </Card>
          )}
        </div>
        <div className="xl:col-span-3">
          <LeaseCalculator lease={lease} />
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="border-slate-100 px-5 py-3 odd:border-r sm:border-r sm:last:border-r-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("font-mono text-base font-semibold tabular", strong ? "text-violet-700" : "text-slate-900")}>{value}</p>
    </div>
  );
}
