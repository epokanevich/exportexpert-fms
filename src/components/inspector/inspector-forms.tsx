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
import { formatUsd } from "@/lib/format";
import { DAMAGE_CODE_LABELS, LOCATION_FACE_LABELS, REPAIR_CODE_LABELS, eorFromDamages } from "@/lib/domain/damage";
import { Plus, Trash2 } from "lucide-react";
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
  const [damages, setDamages] = useState<DamageDraft[]>([]);
  const { run, isPending, fieldErrors } = useServerAction();
  const damagesEor = eorFromDamages(damages.map((d) => ({ costUsd: d.costUsd === "" ? null : Number(d.costUsd) || 0 })));
  const needsEor = techStatus === "DAMAGED" || techStatus === "IN_REPAIR";
  const closesRepair = (row.techStatus === "DAMAGED" || row.techStatus === "IN_REPAIR") && techStatus === "SOUND";

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => inspectContainerAction(row.id, { techStatus, conditionGrade: grade as (typeof CONDITION_GRADES)[number], eorUsd, comment, damages: damages.map(({ key: _key, ...line }) => line) }), onDone);
      }}
    >
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-slate-700">Технический статус</legend>
        <div className="grid grid-cols-2 gap-2">
          {TECH_STATUSES.map((s) => (
            <label key={s} className={cn("flex h-14 cursor-pointer items-center justify-center rounded-xl border-2 text-sm font-semibold transition", techStatus === s ? TECH_TONES[s] : "border-slate-200 bg-white text-slate-600")}>
              <input
                type="radio"
                name="techStatus"
                value={s}
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
      {techStatus !== "SOUND" && <DamageLinesEditor lines={damages} onChange={setDamages} errors={fieldErrors} />}
      {needsEor && (
        <Field
          label="Оценка ремонта (EOR), $"
          htmlFor="in-eor"
          error={fieldErrors.eorUsd}
          hint={damagesEor !== null ? `Пусто — возьмём сумму по строкам: ${formatUsd(damagesEor, 2)}` : undefined}
        >
          <Input id="in-eor" name="eorUsd" type="number" inputMode="decimal" min={0} step="0.01" value={eorUsd} onChange={(e) => setEorUsd(e.target.value)} className="h-12 text-lg" />
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

interface DamageDraft {
  /** Стабильный ключ строки: при удалении строки из середины фокус и ввод не «переезжают» (review MEDIUM). */
  key: string;
  locationCode: string;
  component: string;
  damageCode: string;
  repairCode: string;
  lengthCm: string;
  widthCm: string;
  quantity: string;
  costUsd: string;
}

const newDamage = (): DamageDraft => ({ key: crypto.randomUUID(), locationCode: "", component: "", damageCode: "DT", repairCode: "", lengthCm: "", widthCm: "", quantity: "1", costUsd: "" });

/** Строки повреждений в кодах CEDEX: место, узел, повреждение, ремонт, размер, стоимость. */
function DamageLinesEditor({ lines, onChange, errors }: { lines: DamageDraft[]; onChange: (lines: DamageDraft[]) => void; errors: Record<string, string> }) {
  const update = (index: number, patch: Partial<DamageDraft>) => onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  return (
    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-xs font-medium text-slate-700">Повреждения (коды CEDEX / IICL)</legend>
      <datalist id="cedex-damage">
        {Object.entries(DAMAGE_CODE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </datalist>
      <datalist id="cedex-repair">
        {Object.entries(REPAIR_CODE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </datalist>
      {lines.length === 0 && <p className="text-xs text-slate-500">Строк нет. Добавьте каждое повреждение отдельной строкой — сумма станет EOR.</p>}
      {lines.map((line, i) => (
        <div key={line.key} className="space-y-2 rounded-lg bg-slate-50 p-2.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Место" htmlFor={`dm-loc-${i}`} error={errors[`damages.${i}.locationCode`]} hint={LOCATION_FACE_LABELS[line.locationCode.charAt(0).toUpperCase()]}>
              <Input id={`dm-loc-${i}`} name={`damages.${i}.locationCode`} value={line.locationCode} maxLength={4} placeholder="LX2N" className="font-mono uppercase" onChange={(e) => update(i, { locationCode: e.target.value })} />
            </Field>
            <Field label="Узел" htmlFor={`dm-comp-${i}`} error={errors[`damages.${i}.component`]}>
              <Input id={`dm-comp-${i}`} name={`damages.${i}.component`} value={line.component} placeholder="Боковая панель" onChange={(e) => update(i, { component: e.target.value })} />
            </Field>
            <Field label="Повреждение" htmlFor={`dm-dmg-${i}`} error={errors[`damages.${i}.damageCode`]} hint={DAMAGE_CODE_LABELS[line.damageCode.toUpperCase()]}>
              <Input id={`dm-dmg-${i}`} name={`damages.${i}.damageCode`} list="cedex-damage" value={line.damageCode} maxLength={2} className="font-mono uppercase" onChange={(e) => update(i, { damageCode: e.target.value })} />
            </Field>
            <Field label="Ремонт" htmlFor={`dm-rep-${i}`} error={errors[`damages.${i}.repairCode`]} hint={REPAIR_CODE_LABELS[line.repairCode.toUpperCase()]}>
              <Input id={`dm-rep-${i}`} name={`damages.${i}.repairCode`} list="cedex-repair" value={line.repairCode} maxLength={2} className="font-mono uppercase" onChange={(e) => update(i, { repairCode: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Field label="Длина, см" htmlFor={`dm-l-${i}`}>
              <Input id={`dm-l-${i}`} name={`damages.${i}.lengthCm`} type="number" inputMode="numeric" min={0} value={line.lengthCm} onChange={(e) => update(i, { lengthCm: e.target.value })} />
            </Field>
            <Field label="Ширина, см" htmlFor={`dm-w-${i}`}>
              <Input id={`dm-w-${i}`} name={`damages.${i}.widthCm`} type="number" inputMode="numeric" min={0} value={line.widthCm} onChange={(e) => update(i, { widthCm: e.target.value })} />
            </Field>
            <Field label="Кол-во" htmlFor={`dm-q-${i}`} error={errors[`damages.${i}.quantity`]}>
              <Input id={`dm-q-${i}`} name={`damages.${i}.quantity`} type="number" inputMode="numeric" min={1} value={line.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
            </Field>
            <Field label="Стоимость, $" htmlFor={`dm-c-${i}`} error={errors[`damages.${i}.costUsd`]}>
              <Input id={`dm-c-${i}`} name={`damages.${i}.costUsd`} type="number" inputMode="decimal" min={0} step="0.01" value={line.costUsd} onChange={(e) => update(i, { costUsd: e.target.value })} />
            </Field>
          </div>
          <Button type="button" variant="ghost" size="sm" className="text-rose-600" onClick={() => onChange(lines.filter((_, j) => j !== i))}>
            <Trash2 /> Удалить строку {i + 1}
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, newDamage()])} disabled={lines.length >= 50}>
        <Plus /> Добавить повреждение
      </Button>
    </fieldset>
  );
}
