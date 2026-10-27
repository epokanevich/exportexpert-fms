"use client";

import { useState } from "react";
import { Route } from "lucide-react";
import { createOneWayAction } from "@/actions/one-way";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useServerAction } from "@/components/use-server-action";
import { LOCATIONS, locodeCity, terminalsOf } from "@/lib/domain/constants";
import { addDays, parseDateInput, toLocalDateInput } from "@/lib/dates";
import { formatBic } from "@/lib/iso6346";
import { formatDate } from "@/lib/format";
import type { IssuableContainer } from "@/lib/queries/containers";

const FREE_DAYS_PRESETS = [14, 21, 30, 45];

export function NewTripForm({ containers, onDone, presetContainerId }: { containers: IssuableContainer[]; onDone: () => void; presetContainerId?: string }) {
  const [v, setV] = useState({
    containerId: presetContainerId ?? containers.find((c) => !c.blockReason)?.id ?? "",
    counterpartyName: "",
    counterpartyInn: "",
    counterpartyContact: "",
    bookingRef: `OW-${new Date().getUTCFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    dropoffLocode: "RUMOW",
    dropoffTerminal: "ТЛЦ Ворсино",
    handoverDate: toLocalDateInput(),
    freeDays: "30",
    feeUsd: "0",
    detentionRatePerDayUsd: "15",
    notes: "",
  });
  const { run, isPending, fieldErrors } = useServerAction();
  const set = (key: keyof typeof v, value: string) => setV((prev) => ({ ...prev, [key]: value }));
  const selected = containers.find((c) => c.id === v.containerId);
  const handover = parseDateInput(v.handoverDate);
  const deadline = handover && Number(v.freeDays) > 0 ? addDays(handover, Number(v.freeDays)) : null;

  const blockedCount = containers.filter((c) => c.blockReason).length;
  if (containers.length === blockedCount) {
    return <p className="text-sm text-slate-600">Нет контейнеров, доступных для выдачи.</p>;
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createOneWayAction(v), onDone);
      }}
    >
      <Field
        label="Контейнер на стоке"
        htmlFor="nt-container"
        error={fieldErrors.containerId}
        hint={blockedCount > 0 ? `${blockedCount} ед. заблокированы для выдачи (неисправны или просрочена КБК)` : undefined}
      >
        <Select id="nt-container" value={v.containerId} onChange={(e) => set("containerId", e.target.value)} className="font-mono">
          {containers.map((c) => (
            <option key={c.id} value={c.id} disabled={c.blockReason !== null}>
              {c.blockReason ? "⛔ " : ""}
              {formatBic(c.bicCode)} · {c.sizeType} · {c.currentLocode} {c.currentTerminal}
              {c.blockReason ? ` — ${c.blockReason}` : ""}
            </option>
          ))}
        </Select>
      </Field>
      {selected && (
        <p className="-mt-2 text-xs text-slate-500">
          Точка выдачи: <b>{locodeCity(selected.currentLocode)}</b>, {selected.currentTerminal}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Контрагент" htmlFor="nt-cp" error={fieldErrors.counterpartyName} className="col-span-2">
          <Input id="nt-cp" value={v.counterpartyName} onChange={(e) => set("counterpartyName", e.target.value)} placeholder="ООО «…»" required />
        </Field>
        <Field label="ИНН" htmlFor="nt-inn" error={fieldErrors.counterpartyInn}>
          <Input id="nt-inn" inputMode="numeric" value={v.counterpartyInn} onChange={(e) => set("counterpartyInn", e.target.value.replace(/\D/g, ""))} maxLength={12} className="font-mono" />
        </Field>
        <Field label="Заявка / договор" htmlFor="nt-booking" error={fieldErrors.bookingRef}>
          <Input id="nt-booking" value={v.bookingRef} onChange={(e) => set("bookingRef", e.target.value)} className="font-mono" />
        </Field>
        <Field label="Контакт" htmlFor="nt-contact" error={fieldErrors.counterpartyContact} className="col-span-2">
          <Input id="nt-contact" value={v.counterpartyContact} onChange={(e) => set("counterpartyContact", e.target.value)} placeholder="ФИО, телефон" />
        </Field>
        <Field label="Точка возврата (LOCODE)" htmlFor="nt-dropoff" error={fieldErrors.dropoffLocode}>
          <Select id="nt-dropoff" value={v.dropoffLocode} onChange={(e) => setV((p) => ({ ...p, dropoffLocode: e.target.value, dropoffTerminal: terminalsOf(e.target.value)[0] ?? "" }))}>
            {LOCATIONS.map((l) => (
              <option key={l.code} value={l.code}>{l.code} · {l.city}</option>
            ))}
          </Select>
        </Field>
        <Field label="Депо возврата" htmlFor="nt-dterm" error={fieldErrors.dropoffTerminal}>
          <Input id="nt-dterm" list="nt-terminals" value={v.dropoffTerminal} onChange={(e) => set("dropoffTerminal", e.target.value)} />
          <datalist id="nt-terminals">
            {terminalsOf(v.dropoffLocode).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Дата выдачи (Gate-Out)" htmlFor="nt-date" error={fieldErrors.handoverDate}>
          <Input id="nt-date" type="date" value={v.handoverDate} onChange={(e) => set("handoverDate", e.target.value)} />
        </Field>
        <Field label="Свободных дней" htmlFor="nt-free" error={fieldErrors.freeDays}>
          <Input id="nt-free" type="number" inputMode="numeric" min={1} value={v.freeDays} onChange={(e) => set("freeDays", e.target.value)} />
        </Field>
      </div>
      <div className="-mt-1 flex flex-wrap gap-1.5">
        {FREE_DAYS_PRESETS.map((d) => (
          <button key={d} type="button" onClick={() => set("freeDays", String(d))} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-indigo-100 hover:text-indigo-700">
            {d} дн.
          </button>
        ))}
        {deadline && <span className="ml-auto self-center text-xs text-slate-500">Дедлайн возврата: <b className="font-mono text-slate-900">{formatDate(deadline)}</b></span>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Фикс. ставка / депозит, $" htmlFor="nt-fee" error={fieldErrors.feeUsd} hint="0 — бесплатная выдача">
          <Input id="nt-fee" type="number" inputMode="decimal" min={0} value={v.feeUsd} onChange={(e) => set("feeUsd", e.target.value)} />
        </Field>
        <Field label="Детеншн, $/сутки" htmlFor="nt-det" error={fieldErrors.detentionRatePerDayUsd}>
          <Input id="nt-det" type="number" inputMode="decimal" min={0} value={v.detentionRatePerDayUsd} onChange={(e) => set("detentionRatePerDayUsd", e.target.value)} />
        </Field>
      </div>
      <Field label="Примечание" htmlFor="nt-notes" error={fieldErrors.notes}>
        <Textarea id="nt-notes" rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={isPending}>
        <Route /> Выдать в One-Way
      </Button>
    </form>
  );
}
