"use client";

import { useState } from "react";
import { CircleCheck, PackageCheck, TriangleAlert } from "lucide-react";
import { registerOneWayReturnAction } from "@/actions/one-way";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { useServerAction } from "@/components/use-server-action";
import { computeTripTiming } from "@/lib/domain/one-way";
import { locodeCity, terminalsOf } from "@/lib/domain/constants";
import { parseDateInput, toLocalDateInput } from "@/lib/dates";
import { formatDate, formatDays, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface GateInTrip {
  id: string;
  bookingRef: string;
  dropoffLocode: string;
  dropoffTerminal: string;
  handoverDate: Date;
  deadlineDate: Date;
  freeDays: number;
  detentionRatePerDayUsd: number;
}

/** Фиксация возврата по One-Way (Gate-In) с выбором состояния и предпросмотром детеншна. */
export function GateInForm({ trip, onDone }: { trip: GateInTrip; onDone: () => void }) {
  const [returnDate, setReturnDate] = useState(toLocalDateInput());
  const [terminal, setTerminal] = useState(trip.dropoffTerminal);
  const [condition, setCondition] = useState<"SOUND" | "DAMAGED">("SOUND");
  const [eorUsd, setEorUsd] = useState("");
  const [note, setNote] = useState("");
  const { run, isPending, fieldErrors } = useServerAction();

  const parsedDate = parseDateInput(returnDate);
  const preview = parsedDate
    ? computeTripTiming({ ...trip, status: "COMPLETED", actualReturnDate: parsedDate }, new Date())
    : null;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => registerOneWayReturnAction(trip.id, { returnDate, terminal, condition, eorUsd, note }), onDone);
      }}
    >
      <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-slate-200">
        <p className="text-slate-500">Депо назначения</p>
        <p className="font-medium text-slate-900">{locodeCity(trip.dropoffLocode)} · {trip.dropoffTerminal}</p>
        <p className="mt-1 text-xs text-slate-500">Дедлайн: <span className="font-mono">{formatDate(trip.deadlineDate)}</span> · детеншн {formatUsd(trip.detentionRatePerDayUsd)}/сут.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата Gate-In" htmlFor="gi-date" error={fieldErrors.returnDate}>
          <Input id="gi-date" type="date" value={returnDate} max={toLocalDateInput()} onChange={(e) => setReturnDate(e.target.value)} />
        </Field>
        <Field label="Терминал приёмки" htmlFor="gi-terminal" error={fieldErrors.terminal}>
          <Input id="gi-terminal" list="gi-terminals" value={terminal} onChange={(e) => setTerminal(e.target.value)} />
          <datalist id="gi-terminals">
            {terminalsOf(trip.dropoffLocode).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-slate-700">Техническое состояние при приёмке</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "SOUND", label: "Исправен", icon: CircleCheck, active: "border-emerald-500 bg-emerald-50 text-emerald-800 ring-emerald-500" },
              { value: "DAMAGED", label: "Поврежден", icon: TriangleAlert, active: "border-rose-500 bg-rose-50 text-rose-800 ring-rose-500" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold transition",
                condition === opt.value ? opt.active : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}
            >
              <input type="radio" name="condition" value={opt.value} checked={condition === opt.value} onChange={() => setCondition(opt.value)} className="sr-only" />
              <opt.icon className="size-5" /> {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {condition === "DAMAGED" && (
        <Field label="Оценка ремонта (EOR), $" htmlFor="gi-eor" error={fieldErrors.eorUsd} hint="Будет открыта претензия к контрагенту (статус DISPUTE)">
          <Input id="gi-eor" type="number" inputMode="decimal" min={0} value={eorUsd} onChange={(e) => setEorUsd(e.target.value)} autoFocus />
        </Field>
      )}

      <Field label="Комментарий" htmlFor="gi-note" error={fieldErrors.note}>
        <Textarea id="gi-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Номер EIR, замечания по пломбе и т.п." />
      </Field>

      {preview && (
        <div className={cn("rounded-lg px-3 py-2.5 text-sm ring-1", preview.overdueDays > 0 ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200")}>
          {preview.overdueDays > 0 ? (
            <>Просрочка <b>{formatDays(preview.overdueDays)}</b> → начисляется детеншн <b className="font-mono">{formatUsd(preview.detentionUsd)}</b></>
          ) : (
            <>Возврат в пределах {trip.freeDays} свободных дней — детеншн не начисляется</>
          )}
        </div>
      )}

      <Button type="submit" size="lg" variant="success" className="w-full" loading={isPending}>
        <PackageCheck /> Зафиксировать Gate-In
      </Button>
      <p className="text-center text-xs text-slate-500">Контейнер будет переведён в статус «Свободен на стоке» на терминале назначения</p>
    </form>
  );
}
