"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, ShieldCheck } from "lucide-react";
import { gateInAction, gateOutAction, inspectContainerAction, renewCscAction } from "@/actions/inspector";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useServerAction } from "@/components/use-server-action";
import { CONDITION_GRADES, CONDITION_GRADE_LABELS, LOCATIONS, TECH_STATUSES, TECH_STATUS_LABELS, terminalsOf, type TechStatus } from "@/lib/domain/constants";
import { addMonths, toDateInput } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ContainerRow } from "@/lib/queries/containers";

const TECH_TONES: Record<TechStatus, string> = {
  SOUND: "border-emerald-500 bg-emerald-50 text-emerald-800",
  DAMAGED: "border-rose-500 bg-rose-50 text-rose-800",
  IN_REPAIR: "border-amber-500 bg-amber-50 text-amber-800",
  HOLD: "border-slate-600 bg-slate-100 text-slate-800",
};

export function InspectionForm({ row, presetTech, onDone }: { row: ContainerRow; presetTech?: TechStatus; onDone: () => void }) {
  const [techStatus, setTechStatus] = useState<TechStatus>(presetTech ?? (row.techStatus as TechStatus));
  const [grade, setGrade] = useState(() => {
    if (presetTech === "DAMAGED") return "DAMAGED";
    if (presetTech === "SOUND" && row.conditionGrade === "DAMAGED") return "CW";
    return row.conditionGrade;
  });
  const [eorUsd, setEorUsd] = useState(row.eorAmountUsd ? String(row.eorAmountUsd) : "");
  const [comment, setComment] = useState("");
  const { run, isPending, fieldErrors } = useServerAction();
  const needsEor = techStatus === "DAMAGED" || techStatus === "IN_REPAIR";
  const closesRepair = (row.techStatus === "DAMAGED" || row.techStatus === "IN_REPAIR") && techStatus === "SOUND";

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => inspectContainerAction(row.id, { techStatus, conditionGrade: grade as (typeof CONDITION_GRADES)[number], eorUsd, comment }), onDone);
      }}
    >
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-slate-700">Технический статус</legend>
        <div className="grid grid-cols-2 gap-2">
          {TECH_STATUSES.map((s) => (
            <label key={s} className={cn("flex h-14 cursor-pointer items-center justify-center rounded-xl border-2 text-sm font-semibold transition", techStatus === s ? TECH_TONES[s] : "border-slate-200 bg-white text-slate-600")}>
              <input
                type="radio"
                className="sr-only"
                checked={techStatus === s}
                onChange={() => {
                  setTechStatus(s);
                  if (s === "DAMAGED") setGrade("DAMAGED");
                  if (s === "SOUND" && grade === "DAMAGED") setGrade("CW");
                }}
              />
              {TECH_STATUS_LABELS[s]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Грейд состояния" htmlFor="in-grade" error={fieldErrors.conditionGrade}>
        <Select id="in-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
          {CONDITION_GRADES.map((g) => (
            <option key={g} value={g}>{CONDITION_GRADE_LABELS[g]}</option>
          ))}
        </Select>
      </Field>
      {needsEor && (
        <Field label="Оценка ремонта (EOR), $" htmlFor="in-eor" error={fieldErrors.eorUsd}>
          <Input id="in-eor" type="number" inputMode="decimal" min={0} value={eorUsd} onChange={(e) => setEorUsd(e.target.value)} className="h-12 text-lg" />
        </Field>
      )}
      {closesRepair && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
          Ремонт будет закрыт: EOR {row.eorAmountUsd ? `$${row.eorAmountUsd}` : ""} спишется в затраты на ремонт, контейнер вернётся на сток.
        </p>
      )}
      <Field label="Замечания" htmlFor="in-comment" error={fieldErrors.comment}>
        <Textarea id="in-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Вмятины, пломба, чистота, номер EIR…" />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={isPending}>
        <ClipboardCheck /> Сохранить акт осмотра
      </Button>
    </form>
  );
}

export function GateInHereForm({ row, onDone }: { row: ContainerRow; onDone: () => void }) {
  const [locode, setLocode] = useState(row.currentLocode);
  const [terminal, setTerminal] = useState(terminalsOf(row.currentLocode)[0] ?? "");
  const { run, isPending, fieldErrors } = useServerAction();
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => gateInAction(row.id, { locode, terminal }), onDone); }}>
      <Field label="Город / порт" htmlFor="gin-loc" error={fieldErrors.locode}>
        <Select id="gin-loc" value={locode} onChange={(e) => { setLocode(e.target.value); setTerminal(terminalsOf(e.target.value)[0] ?? ""); }}>
          {LOCATIONS.map((l) => (
            <option key={l.code} value={l.code}>{l.code} · {l.city}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-2">
        {terminalsOf(locode).map((t) => (
          <button key={t} type="button" onClick={() => setTerminal(t)} className={cn("h-12 rounded-xl border-2 px-4 text-left text-sm font-medium", terminal === t ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "border-slate-200 text-slate-700")}>
            {t}
          </button>
        ))}
      </div>
      <Field label="Или другой терминал" htmlFor="gin-term" error={fieldErrors.terminal}>
        <Input id="gin-term" value={terminal} onChange={(e) => setTerminal(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" variant="success" className="w-full" loading={isPending}>
        <ArrowDownToLine /> Gate-In: принять на терминал
      </Button>
    </form>
  );
}

export function GateOutForm({ row, onDone }: { row: ContainerRow; onDone: () => void }) {
  const [destination, setDestination] = useState<string>(LOCATIONS.find((l) => l.code !== row.currentLocode)?.code ?? "RUMOW");
  const [note, setNote] = useState("");
  const { run, isPending, fieldErrors } = useServerAction();
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => gateOutAction(row.id, { destinationLocode: destination, note }), onDone); }}>
      <p className="text-sm text-slate-600">Отправка в собственный рейс (гружёный или порожний). Для выдачи контрагенту используйте модуль One-Way.</p>
      <Field label="Пункт назначения" htmlFor="gout-dest" error={fieldErrors.destinationLocode}>
        <Select id="gout-dest" value={destination} onChange={(e) => setDestination(e.target.value)}>
          {LOCATIONS.filter((l) => l.code !== row.currentLocode).map((l) => (
            <option key={l.code} value={l.code}>{l.code} · {l.city}</option>
          ))}
        </Select>
      </Field>
      <Field label="Комментарий" htmlFor="gout-note" error={fieldErrors.note}>
        <Input id="gout-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Номер поезда / судна, пломба" />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={isPending}>
        <ArrowUpFromLine /> Gate-Out
      </Button>
    </form>
  );
}

export function CscRenewForm({ row, onDone }: { row: ContainerRow; onDone: () => void }) {
  // ACEP: следующее освидетельствование — не позднее чем через 30 месяцев.
  const [date, setDate] = useState(toDateInput(addMonths(new Date(), 30)));
  const { run, isPending, fieldErrors } = useServerAction();
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => renewCscAction(row.id, { cscPlateExpiry: date }), onDone); }}>
      <p className="text-sm text-slate-600">По программе ACEP следующее освидетельствование — не позднее 30 месяцев с даты осмотра.</p>
      <Field label="Новая дата действия КБК (CSC)" htmlFor="csc-date" error={fieldErrors.cscPlateExpiry}>
        <Input id="csc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 text-lg" />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={isPending}>
        <ShieldCheck /> Продлить КБК
      </Button>
    </form>
  );
}
