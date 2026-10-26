"use client";

import { useState } from "react";
import { CalendarPlus, CircleCheck, FileText, PackageCheck, ShieldAlert, TriangleAlert } from "lucide-react";
import { createLeaseAction, extendLeaseAction, offHireAction, updatePaymentStatusAction } from "@/actions/leases";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { BicCode } from "@/components/status-badges";
import { useServerAction } from "@/components/use-server-action";
import { LOCATIONS, PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, locodeCity, terminalsOf } from "@/lib/domain/constants";
import { addMonths, parseDateInput, toDateInput } from "@/lib/dates";
import { formatBic } from "@/lib/iso6346";
import { formatDate, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { IssuableContainer } from "@/lib/queries/containers";
import type { LeaseRow } from "@/lib/queries/operations";

/* ── Новый договор ───────────────────────────────────────────────────── */

export function NewLeaseForm({ containers, onDone }: { containers: IssuableContainer[]; onDone: () => void }) {
  const today = new Date();
  const [v, setV] = useState({
    contractNumber: `LC-${today.getUTCFullYear()}/${String(Math.floor(Math.random() * 900) + 100)}`,
    lesseeName: "",
    lesseeInn: "",
    contactPerson: "",
    contactPhone: "",
    contactEmail: "",
    startDate: toDateInput(today),
    endDate: toDateInput(addMonths(today, 12)),
    dailyRateUsd: "2.50",
    depositUsd: "0",
    notes: "",
  });
  const [autoRenewal, setAutoRenewal] = useState(false);
  const [allowed, setAllowed] = useState<string[]>(["RUVVO", "RUMOW"]);
  const [selected, setSelected] = useState<string[]>([]);
  const { run, isPending, fieldErrors } = useServerAction();
  const set = (key: keyof typeof v, value: string) => setV((p) => ({ ...p, [key]: value }));
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const start = parseDateInput(v.startDate);
  const end = parseDateInput(v.endDate);
  const termDays = start && end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000)) : 0;
  const contractValue = termDays * Number(v.dailyRateUsd || 0) * selected.length;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createLeaseAction({ ...v, autoRenewal, allowedReturnLocodes: allowed, containerIds: selected }), onDone);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Номер договора" htmlFor="nl-num" error={fieldErrors.contractNumber}>
          <Input id="nl-num" value={v.contractNumber} onChange={(e) => set("contractNumber", e.target.value)} className="font-mono" />
        </Field>
        <Field label="ИНН арендатора" htmlFor="nl-inn" error={fieldErrors.lesseeInn}>
          <Input id="nl-inn" inputMode="numeric" maxLength={12} value={v.lesseeInn} onChange={(e) => set("lesseeInn", e.target.value.replace(/\D/g, ""))} className="font-mono" />
        </Field>
        <Field label="Арендатор" htmlFor="nl-lessee" error={fieldErrors.lesseeName} className="col-span-2">
          <Input id="nl-lessee" value={v.lesseeName} onChange={(e) => set("lesseeName", e.target.value)} placeholder="ООО «…»" required />
        </Field>
        <Field label="Контактное лицо" htmlFor="nl-person" error={fieldErrors.contactPerson} className="col-span-2">
          <Input id="nl-person" value={v.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} required />
        </Field>
        <Field label="Телефон" htmlFor="nl-phone" error={fieldErrors.contactPhone}>
          <Input id="nl-phone" type="tel" value={v.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="nl-email" error={fieldErrors.contactEmail}>
          <Input id="nl-email" type="email" value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
        </Field>
        <Field label="On-Hire (начало)" htmlFor="nl-start" error={fieldErrors.startDate}>
          <Input id="nl-start" type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="Плановый Off-Hire" htmlFor="nl-end" error={fieldErrors.endDate}>
          <Input id="nl-end" type="date" value={v.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </Field>
        <Field label="Per Diem, $/сутки за ед." htmlFor="nl-rate" error={fieldErrors.dailyRateUsd}>
          <Input id="nl-rate" type="number" inputMode="decimal" step="0.05" min={0} value={v.dailyRateUsd} onChange={(e) => set("dailyRateUsd", e.target.value)} />
        </Field>
        <Field label="Депозит, $" htmlFor="nl-deposit" error={fieldErrors.depositUsd}>
          <Input id="nl-deposit" type="number" inputMode="decimal" min={0} value={v.depositUsd} onChange={(e) => set("depositUsd", e.target.value)} />
        </Field>
      </div>

      <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm">
        <input type="checkbox" checked={autoRenewal} onChange={(e) => setAutoRenewal(e.target.checked)} className="size-4 accent-indigo-600" />
        Автопролонгация по окончании срока
      </label>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-slate-700">Разрешённые регионы возврата</legend>
        <div className="flex flex-wrap gap-1.5">
          {LOCATIONS.map((l) => (
            <button
              key={l.code}
              type="button"
              aria-pressed={allowed.includes(l.code)}
              onClick={() => setAllowed((p) => toggle(p, l.code))}
              className={cn("rounded-full px-3 py-1.5 text-xs font-medium ring-1", allowed.includes(l.code) ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-600 ring-slate-200")}
            >
              {l.code} · {l.city}
            </button>
          ))}
        </div>
        {fieldErrors.allowedReturnLocodes && <p className="mt-1 text-xs text-rose-600">{fieldErrors.allowedReturnLocodes}</p>}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-slate-700">
          Контейнеры ({selected.length} выбрано из {containers.filter((c) => !c.blockReason).length} доступных)
        </legend>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1">
          {containers.length === 0 && <p className="p-3 text-sm text-slate-500">Нет контейнеров на стоке</p>}
          {containers.map((c) => {
            const blocked = c.blockReason !== null;
            return (
              <label
                key={c.id}
                title={c.blockReason ?? undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-2 text-sm",
                  blocked ? "cursor-not-allowed bg-rose-50/60" : "cursor-pointer",
                  !blocked && (selected.includes(c.id) ? "bg-indigo-50" : "hover:bg-slate-50"),
                )}
              >
                <input type="checkbox" aria-label={formatBic(c.bicCode)} disabled={blocked} checked={selected.includes(c.id)} onChange={() => setSelected((p) => toggle(p, c.id))} className="size-4 accent-indigo-600" />
                <BicCode code={c.bicCode} size="sm" />
                <span className="font-mono text-xs text-slate-500">{c.sizeType}</span>
                {blocked ? (
                  <span className="ml-auto flex min-w-0 items-center gap-1 truncate text-xs font-medium text-rose-700">
                    <ShieldAlert className="size-3.5 shrink-0" /> {c.blockReason}
                  </span>
                ) : (
                  <span className="ml-auto truncate text-xs text-slate-500">{c.currentLocode} · {c.currentTerminal}</span>
                )}
              </label>
            );
          })}
        </div>
        {fieldErrors.containerIds && <p className="mt-1 text-xs text-rose-600">{fieldErrors.containerIds}</p>}
      </fieldset>

      <Field label="Примечание" htmlFor="nl-notes" error={fieldErrors.notes}>
        <Textarea id="nl-notes" rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>

      <div className="rounded-lg bg-slate-900 px-4 py-3 text-sm text-white">
        <p className="text-slate-400">Стоимость договора за весь срок</p>
        <p className="font-mono text-xl font-semibold">{formatUsd(Math.round(contractValue))}</p>
        <p className="font-mono text-xs text-slate-400">{termDays} сут. × {formatUsd(Number(v.dailyRateUsd || 0), 2)} × {selected.length} ед.</p>
      </div>

      <Button type="submit" size="lg" className="w-full" loading={isPending}>
        <FileText /> Оформить договор и On-Hire
      </Button>
    </form>
  );
}

/* ── Продление ───────────────────────────────────────────────────────── */

export function ExtendLeaseForm({ lease, onDone }: { lease: LeaseRow; onDone: () => void }) {
  const [months, setMonths] = useState("3");
  const [rate, setRate] = useState(String(lease.dailyRateUsd));
  const { run, isPending, fieldErrors } = useServerAction();
  const newEnd = Number(months) > 0 ? addMonths(new Date(lease.endDate), Number(months)) : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => extendLeaseAction(lease.id, { months, newDailyRateUsd: rate }), onDone);
      }}
    >
      <p className="text-sm text-slate-600">
        Текущий срок окончания: <b className="font-mono">{formatDate(lease.endDate)}</b>
      </p>
      <div className="flex gap-1.5">
        {[3, 6, 12].map((m) => (
          <button key={m} type="button" onClick={() => setMonths(String(m))} className={cn("flex-1 rounded-lg py-2.5 text-sm font-medium ring-1", months === String(m) ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-700 ring-slate-200")}>
            +{m} мес.
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Продлить на, мес." htmlFor="ex-m" error={fieldErrors.months}>
          <Input id="ex-m" type="number" inputMode="numeric" min={1} value={months} onChange={(e) => setMonths(e.target.value)} />
        </Field>
        <Field label="Per Diem, $/сут." htmlFor="ex-rate" error={fieldErrors.newDailyRateUsd}>
          <Input id="ex-rate" type="number" inputMode="decimal" step="0.05" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
      </div>
      {newEnd && (
        <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900 ring-1 ring-indigo-100">
          Новый срок окончания: <b className="font-mono">{formatDate(newEnd)}</b>
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={isPending}>
        <CalendarPlus /> Продлить договор
      </Button>
    </form>
  );
}

/* ── Off-Hire ────────────────────────────────────────────────────────── */

export function OffHireForm({ lease, onDone }: { lease: LeaseRow; onDone: () => void }) {
  const onHire = lease.items.filter((i) => !i.offHireDate);
  const [itemIds, setItemIds] = useState<string[]>(onHire.map((i) => i.id));
  const [returnDate, setReturnDate] = useState(toDateInput(new Date()));
  const [returnLocode, setReturnLocode] = useState(lease.allowedReturnLocodes[0] ?? "");
  const [terminal, setTerminal] = useState(terminalsOf(lease.allowedReturnLocodes[0] ?? "")[0] ?? "");
  const [condition, setCondition] = useState<"SOUND" | "DAMAGED">("SOUND");
  const [eorUsd, setEorUsd] = useState("");
  const { run, isPending, fieldErrors } = useServerAction();

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => offHireAction(lease.id, { itemIds, returnDate, returnLocode, terminal, condition, eorUsd }), onDone);
      }}
    >
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-slate-700">Контейнеры к возврату</legend>
        <div className="space-y-1 rounded-lg border border-slate-200 p-1">
          {onHire.map((i) => (
            <label key={i.id} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm", itemIds.includes(i.id) ? "bg-indigo-50" : "hover:bg-slate-50")}>
              <input type="checkbox" aria-label={formatBic(i.bicCode)} checked={itemIds.includes(i.id)} onChange={() => setItemIds((p) => (p.includes(i.id) ? p.filter((x) => x !== i.id) : [...p, i.id]))} className="size-4 accent-indigo-600" />
              <BicCode code={i.bicCode} size="sm" />
              <span className="ml-auto font-mono text-xs text-slate-500">{i.sizeType}</span>
            </label>
          ))}
        </div>
        {fieldErrors.itemIds && <p className="mt-1 text-xs text-rose-600">{fieldErrors.itemIds}</p>}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата Off-Hire" htmlFor="oh-date" error={fieldErrors.returnDate}>
          <Input id="oh-date" type="date" value={returnDate} max={toDateInput(new Date())} onChange={(e) => setReturnDate(e.target.value)} />
        </Field>
        <Field label="Регион возврата" htmlFor="oh-loc" error={fieldErrors.returnLocode} hint="Только разрешённые договором">
          <Select id="oh-loc" value={returnLocode} onChange={(e) => { setReturnLocode(e.target.value); setTerminal(terminalsOf(e.target.value)[0] ?? ""); }}>
            {lease.allowedReturnLocodes.map((code) => (
              <option key={code} value={code}>{code} · {locodeCity(code)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Депо возврата" htmlFor="oh-term" error={fieldErrors.terminal} className="col-span-2">
          <Input id="oh-term" list="oh-terminals" value={terminal} onChange={(e) => setTerminal(e.target.value)} />
          <datalist id="oh-terminals">
            {terminalsOf(returnLocode).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-slate-700">Off-Hire Survey</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "SOUND", label: "Без замечаний", icon: CircleCheck, active: "border-emerald-500 bg-emerald-50 text-emerald-800" },
              { value: "DAMAGED", label: "Повреждение", icon: TriangleAlert, active: "border-rose-500 bg-rose-50 text-rose-800" },
            ] as const
          ).map((opt) => (
            <label key={opt.value} className={cn("flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold", condition === opt.value ? opt.active : "border-slate-200 text-slate-600")}>
              <input type="radio" className="sr-only" checked={condition === opt.value} onChange={() => setCondition(opt.value)} />
              <opt.icon className="size-4" /> {opt.label}
            </label>
          ))}
        </div>
      </fieldset>
      {condition === "DAMAGED" && (
        <Field label="EOR, $" htmlFor="oh-eor" error={fieldErrors.eorUsd} hint="Выставляется арендатору по условиям договора">
          <Input id="oh-eor" type="number" inputMode="decimal" min={0} value={eorUsd} onChange={(e) => setEorUsd(e.target.value)} />
        </Field>
      )}
      <Button type="submit" size="lg" className="w-full" loading={isPending}>
        <PackageCheck /> Оформить Off-Hire ({itemIds.length} ед.)
      </Button>
    </form>
  );
}

/* ── Статус оплаты ───────────────────────────────────────────────────── */

export function PaymentStatusForm({ lease, onDone }: { lease: LeaseRow; onDone: () => void }) {
  const { run, isPending } = useServerAction();
  const tones: Record<string, string> = { PAID: "border-emerald-500 bg-emerald-50 text-emerald-800", PENDING: "border-amber-500 bg-amber-50 text-amber-800", OVERDUE: "border-rose-500 bg-rose-50 text-rose-800" };
  return (
    <div className="space-y-2">
      {PAYMENT_STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          disabled={isPending}
          onClick={() => run(() => updatePaymentStatusAction(lease.id, { paymentStatus: status }), onDone)}
          className={cn("flex h-12 w-full items-center justify-between rounded-xl border-2 px-4 text-sm font-semibold transition", lease.paymentStatus === status ? tones[status] : "border-slate-200 text-slate-700 hover:border-slate-300")}
        >
          {PAYMENT_STATUS_LABELS[status]}
          {lease.paymentStatus === status && <span className="text-xs font-normal">текущий</span>}
        </button>
      ))}
    </div>
  );
}
