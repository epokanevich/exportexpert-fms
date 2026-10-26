"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeDollarSign, CalendarPlus, Calculator, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, Field, Input, Select } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { BicCode, TechStatusBadge } from "@/components/status-badges";
import { ExtendLeaseForm, OffHireForm, PaymentStatusForm } from "./lease-forms";
import { rentalDaysInRange } from "@/lib/domain/lease";
import { addDays, parseDateInput, startOfMonthUtc, toDateInput } from "@/lib/dates";
import { formatDate, formatUsd } from "@/lib/format";
import type { LeaseRow } from "@/lib/queries/operations";

export function LeaseActions({ lease }: { lease: LeaseRow }) {
  const [sheet, setSheet] = useState<"extend" | "offhire" | "payment" | null>(null);
  const close = () => setSheet(null);
  const isActive = lease.status === "ACTIVE";

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:flex">
        <Button variant="outline" onClick={() => setSheet("payment")}>
          <BadgeDollarSign /> <span className="truncate">Оплата</span>
        </Button>
        <Button variant="outline" onClick={() => setSheet("extend")} disabled={!isActive}>
          <CalendarPlus /> <span className="truncate">Продлить</span>
        </Button>
        <Button onClick={() => setSheet("offhire")} disabled={!isActive || lease.metrics.activeUnits === 0}>
          <PackageCheck /> <span className="truncate">Off-Hire</span>
        </Button>
      </div>
      <Sheet open={sheet === "extend"} onClose={close} title={`Продление ${lease.contractNumber}`}>
        <ExtendLeaseForm lease={lease} onDone={close} />
      </Sheet>
      <Sheet open={sheet === "offhire"} onClose={close} title="Возврат из аренды (Off-Hire)" description={lease.lesseeName}>
        <OffHireForm lease={lease} onDone={close} />
      </Sheet>
      <Sheet open={sheet === "payment"} onClose={close} title="Статус оплаты текущего месяца" description={lease.contractNumber}>
        <PaymentStatusForm lease={lease} onDone={close} />
      </Sheet>
    </>
  );
}

type Period = "month" | "term" | "custom";

/** Калькулятор начислений: дни аренды × Per Diem по каждой единице за выбранный период. */
export function LeaseCalculator({ lease }: { lease: LeaseRow }) {
  const today = new Date();
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState(toDateInput(startOfMonthUtc(today)));
  const [to, setTo] = useState(toDateInput(today));

  const range = (() => {
    if (period === "month") return { start: startOfMonthUtc(today), end: today };
    if (period === "term") return { start: new Date(lease.startDate), end: today };
    return { start: parseDateInput(from) ?? today, end: parseDateInput(to) ?? today };
  })();

  const rows = lease.items.map((item) => {
    const days = rentalDaysInRange({ onHireDate: new Date(item.onHireDate), offHireDate: item.offHireDate ? new Date(item.offHireDate) : null }, range.start, range.end);
    return { ...item, days, amount: days * lease.dailyRateUsd };
  });
  const totalDays = rows.reduce((s, r) => s + r.days, 0);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const forecastToEnd = lease.status === "ACTIVE" ? Math.max(0, Math.round((new Date(lease.endDate).getTime() - today.getTime()) / 86_400_000)) * lease.metrics.activeUnits * lease.dailyRateUsd : 0;

  return (
    <Card>
      <CardHeader icon={<Calculator />} title="Калькулятор начислений" description="Дни аренды × ставка × единицы (день Off-Hire не тарифицируется)" />
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Период" htmlFor="calc-period">
            <Select id="calc-period" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="month">Текущий месяц</option>
              <option value="term">Весь срок договора</option>
              <option value="custom">Произвольный период</option>
            </Select>
          </Field>
          {period === "custom" && (
            <>
              <Field label="С" htmlFor="calc-from">
                <Input id="calc-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="По" htmlFor="calc-to">
                <Input id="calc-to" type="date" value={to} max={toDateInput(addDays(today, 3650))} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Контейнер</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">On-Hire / Off-Hire</th>
                <th className="px-3 py-2 text-right font-medium">Дней</th>
                <th className="px-3 py-2 text-right font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2.5">
                    <Link href={`/containers/${r.containerId}`} className="hover:underline"><BicCode code={r.bicCode} size="sm" /></Link>
                    <div className="mt-0.5 flex items-center gap-1.5 sm:hidden">
                      <span className="font-mono text-[11px] text-slate-400">{formatDate(r.onHireDate)} — {r.offHireDate ? formatDate(r.offHireDate) : "н.в."}</span>
                    </div>
                  </td>
                  <td className="hidden px-3 py-2.5 sm:table-cell">
                    <span className="font-mono text-xs text-slate-600">{formatDate(r.onHireDate)} — {r.offHireDate ? formatDate(r.offHireDate) : "на руках"}</span>
                    {r.techStatus !== "SOUND" && <span className="ml-2"><TechStatusBadge status={r.techStatus} /></span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{r.days}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatUsd(r.amount, 2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-900 text-white">
              <tr>
                <td className="px-3 py-3 font-medium">Итого · {formatUsd(lease.dailyRateUsd, 2)}/сут.</td>
                <td className="hidden sm:table-cell" />
                <td className="px-3 py-3 text-right font-mono">{totalDays}</td>
                <td className="px-3 py-3 text-right font-mono text-lg font-semibold">{formatUsd(total, 2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {forecastToEnd > 0 && (
          <p className="text-xs text-slate-500">
            Прогноз до планового Off-Hire ({formatDate(lease.endDate)}): <b className="font-mono text-slate-800">{formatUsd(Math.round(forecastToEnd))}</b> при текущих {lease.metrics.activeUnits} ед.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
