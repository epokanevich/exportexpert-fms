"use client";

import { useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { createContainerAction, updateContainerAction, type ContainerInput } from "@/actions/containers";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useServerAction } from "@/components/use-server-action";
import {
  CONDITION_GRADES,
  CONDITION_GRADE_LABELS,
  DEFAULT_ISO_CODE,
  DEFAULT_WEIGHTS,
  LOCATIONS,
  OPERATIONAL_STATUSES,
  EDITABLE_OPERATIONAL_STATUSES,
  MANAGED_OPERATIONAL_STATUSES,
  OPERATIONAL_STATUS_LABELS,
  SIZE_TYPES,
  SIZE_TYPE_LABELS,
  TECH_STATUSES,
  TECH_STATUS_LABELS,
  isOneOf,
  terminalsOf,
} from "@/lib/domain/constants";
import { formatBic, validateBic } from "@/lib/iso6346";
import { addDays, toLocalDateInput } from "@/lib/dates";
import { formatNumber } from "@/lib/format";

export interface ContainerFormValues {
  bicCode: string;
  sizeType: string;
  isoCode: string;
  manufactureYear: string;
  colorRal: string;
  manufacturer: string;
  tareWeightKg: string;
  maxGrossWeightKg: string;
  conditionGrade: string;
  techStatus: string;
  cscPlateExpiry: string;
  eorAmountUsd: string;
  operationalStatus: string;
  currentLocode: string;
  currentTerminal: string;
  storageRatePerDayUsd: string;
  purchaseDate: string;
  purchasePriceUsd: string;
  currentBookValueUsd: string;
  notes: string;
}

export function emptyContainerForm(): ContainerFormValues {
  const today = new Date();
  return {
    bicCode: "",
    sizeType: "40HC",
    isoCode: DEFAULT_ISO_CODE["40HC"],
    manufactureYear: String(today.getUTCFullYear()),
    colorRal: "RAL 5013 (кобальтовый синий)",
    manufacturer: "CIMC Qingdao",
    tareWeightKg: String(DEFAULT_WEIGHTS["40HC"].tare),
    maxGrossWeightKg: String(DEFAULT_WEIGHTS["40HC"].gross),
    conditionGrade: "IICL6",
    techStatus: "SOUND",
    cscPlateExpiry: toLocalDateInput(addDays(today, 365 * 5)),
    eorAmountUsd: "",
    operationalStatus: "AVAILABLE",
    currentLocode: "CNSHA",
    currentTerminal: "Shanghai SIPG",
    storageRatePerDayUsd: "2",
    purchaseDate: toLocalDateInput(today),
    purchasePriceUsd: "4350",
    currentBookValueUsd: "4350",
    notes: "",
  };
}

interface ContainerFormProps {
  containerId?: string;
  initial: ContainerFormValues;
  onDone: (id?: string) => void;
}

export function ContainerForm({ containerId, initial, onDone }: ContainerFormProps) {
  const [values, setValues] = useState(initial);
  const { run, isPending, fieldErrors } = useServerAction();
  const isEdit = Boolean(containerId);
  const bic = validateBic(values.bicCode);
  const isManaged = isOneOf(MANAGED_OPERATIONAL_STATUSES, values.operationalStatus);
  /** D-21: в режиме правки техсостояние и КБК меняются только актом осмотра / продлением КБК. */
  const techLocked = isEdit;
  const techHint = techLocked ? "Меняется актом осмотра" : undefined;
  const terminals = terminalsOf(values.currentLocode);
  const payload = Number(values.maxGrossWeightKg) - Number(values.tareWeightKg);

  function set<K extends keyof ContainerFormValues>(key: K, value: ContainerFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSizeChange(size: string) {
    if (!isOneOf(SIZE_TYPES, size)) return;
    setValues((prev) => ({
      ...prev,
      sizeType: size,
      isoCode: DEFAULT_ISO_CODE[size],
      tareWeightKg: String(DEFAULT_WEIGHTS[size].tare),
      maxGrossWeightKg: String(DEFAULT_WEIGHTS[size].gross),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Строковые значения формы приводятся и валидируются Zod-схемой на сервере.
    const input = values as unknown as ContainerInput;
    run(
      () => (containerId ? updateContainerAction(containerId, input) : createContainerAction(input)),
      (result) => onDone(result.id),
    );
  }

  const err = (key: string) => fieldErrors[key];

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset className="space-y-3">
          <legend className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">Паспорт и идентификация</legend>
          <Field label="Номер контейнера (ISO 6346)" htmlFor="bicCode" error={err("bicCode")}>
            <Input
              id="bicCode"
              value={values.bicCode}
              onChange={(e) => set("bicCode", e.target.value.toUpperCase())}
              placeholder="EXEX 402918-4"
              className="font-mono text-base tracking-wide uppercase"
              aria-invalid={values.bicCode.length > 0 && !bic.valid}
              autoComplete="off"
              required
            />
          </Field>
          {values.bicCode.length >= 10 && (
            <div className={`rounded-lg px-3 py-2 text-xs ring-1 ${bic.valid ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-rose-200"}`}>
              {bic.valid ? (
                <p className="flex items-center gap-1.5">
                  <CircleCheck className="size-3.5" /> Номер корректен: <span className="font-mono font-semibold">{formatBic(bic.normalized)}</span>
                </p>
              ) : (
                <p className="flex items-center gap-1.5">
                  <TriangleAlert className="size-3.5" /> {bic.errors[0]}
                  {bic.expectedCheckDigit !== null && (
                    <button type="button" className="ml-auto font-medium underline" onClick={() => set("bicCode", formatBic(bic.normalized.slice(0, 10) + bic.expectedCheckDigit))}>
                      Подставить
                    </button>
                  )}
                </p>
              )}
              {bic.warnings.map((w) => (
                <p key={w} className="mt-1 text-amber-700">⚠ {w}</p>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Типоразмер" htmlFor="sizeType" error={err("sizeType")}>
              <Select id="sizeType" value={values.sizeType} onChange={(e) => handleSizeChange(e.target.value)}>
                {SIZE_TYPES.map((s) => (
                  <option key={s} value={s}>{SIZE_TYPE_LABELS[s]}</option>
                ))}
              </Select>
            </Field>
            <Field label="ISO-код типа" htmlFor="isoCode" error={err("isoCode")}>
              <Input id="isoCode" value={values.isoCode} onChange={(e) => set("isoCode", e.target.value.toUpperCase())} className="font-mono" maxLength={4} />
            </Field>
            <Field label="Год выпуска" htmlFor="manufactureYear" error={err("manufactureYear")}>
              <Input id="manufactureYear" type="number" inputMode="numeric" value={values.manufactureYear} onChange={(e) => set("manufactureYear", e.target.value)} />
            </Field>
            <Field label="Цвет (RAL)" htmlFor="colorRal" error={err("colorRal")}>
              <Input id="colorRal" value={values.colorRal} onChange={(e) => set("colorRal", e.target.value)} />
            </Field>
            <Field label="Завод-изготовитель" htmlFor="manufacturer" error={err("manufacturer")} className="col-span-2">
              <Input id="manufacturer" value={values.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} />
            </Field>
            <Field label="Тара, кг" htmlFor="tare" error={err("tareWeightKg")}>
              <Input id="tare" type="number" inputMode="numeric" value={values.tareWeightKg} onChange={(e) => set("tareWeightKg", e.target.value)} />
            </Field>
            <Field label="Брутто (MGW), кг" htmlFor="gross" error={err("maxGrossWeightKg")} hint={payload > 0 ? `Макс. загрузка: ${formatNumber(payload)} кг` : undefined}>
              <Input id="gross" type="number" inputMode="numeric" value={values.maxGrossWeightKg} onChange={(e) => set("maxGrossWeightKg", e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">Техническое состояние</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Грейд" htmlFor="grade" error={err("conditionGrade")} hint={techHint}>
              <Select id="grade" name="conditionGrade" value={values.conditionGrade} disabled={techLocked} onChange={(e) => set("conditionGrade", e.target.value)}>
                {CONDITION_GRADES.map((g) => (
                  <option key={g} value={g}>{CONDITION_GRADE_LABELS[g]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Тех. статус" htmlFor="tech" error={err("techStatus")} hint={techHint}>
              <Select id="tech" name="techStatus" value={values.techStatus} disabled={techLocked} onChange={(e) => set("techStatus", e.target.value)}>
                {TECH_STATUSES.map((t) => (
                  <option key={t} value={t}>{TECH_STATUS_LABELS[t]}</option>
                ))}
              </Select>
            </Field>
            <Field label="КБК (CSC) действует до" htmlFor="csc" error={err("cscPlateExpiry")} hint={techLocked ? "Меняется кнопкой «Продлить КБК»" : undefined}>
              <Input id="csc" name="cscPlateExpiry" type="date" value={values.cscPlateExpiry} disabled={techLocked} onChange={(e) => set("cscPlateExpiry", e.target.value)} />
            </Field>
            <Field label="EOR, $" htmlFor="eor" error={err("eorAmountUsd")} hint={techLocked ? "Меняется актом осмотра" : "Оценка ремонта"}>
              <Input id="eor" name="eorAmountUsd" type="number" inputMode="decimal" min={0} step="0.01" value={values.eorAmountUsd} disabled={techLocked} onChange={(e) => set("eorAmountUsd", e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">Дислокация</legend>
          <Field label="Операционный статус" htmlFor="op" error={err("operationalStatus")} hint={isManaged ? "Управляется модулем One-Way / аренды / списанием" : undefined}>
            <Select id="op" value={values.operationalStatus} onChange={(e) => set("operationalStatus", e.target.value)} disabled={isEdit && isManaged}>
              {(isManaged ? OPERATIONAL_STATUSES : EDITABLE_OPERATIONAL_STATUSES).map((s) => (
                <option key={s} value={s}>
                  {OPERATIONAL_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="UN/LOCODE" htmlFor="locode" error={err("currentLocode")}>
              <Select
                id="locode"
                value={values.currentLocode}
                disabled={isManaged}
                onChange={(e) => setValues((prev) => ({ ...prev, currentLocode: e.target.value, currentTerminal: terminalsOf(e.target.value)[0] ?? "" }))}
              >
                {LOCATIONS.map((l) => (
                  <option key={l.code} value={l.code}>{l.code} · {l.city}</option>
                ))}
              </Select>
            </Field>
            <Field label="Терминал / депо" htmlFor="terminal" error={err("currentTerminal")}>
              <Input id="terminal" list="terminal-options" value={values.currentTerminal} disabled={isManaged} onChange={(e) => set("currentTerminal", e.target.value)} />
              <datalist id="terminal-options">
                {terminals.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Хранение, $/сутки" htmlFor="storageRate" error={err("storageRatePerDayUsd")}>
              <Input id="storageRate" type="number" inputMode="decimal" step="0.1" min={0} value={values.storageRatePerDayUsd} onChange={(e) => set("storageRatePerDayUsd", e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">Финансы</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дата покупки" htmlFor="purchaseDate" error={err("purchaseDate")}>
              <Input id="purchaseDate" type="date" value={values.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
            </Field>
            <Field label="Цена покупки, $" htmlFor="price" error={err("purchasePriceUsd")}>
              <Input id="price" type="number" inputMode="decimal" min={0} value={values.purchasePriceUsd} onChange={(e) => set("purchasePriceUsd", e.target.value)} />
            </Field>
            <Field label="Остаточная стоимость, $" htmlFor="book" error={err("currentBookValueUsd")} className="col-span-2">
              <Input id="book" type="number" inputMode="decimal" min={0} value={values.currentBookValueUsd} onChange={(e) => set("currentBookValueUsd", e.target.value)} />
            </Field>
          </div>
          <Field label="Примечания" htmlFor="notes" error={err("notes")}>
            <Textarea id="notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </Field>
        </fieldset>

        <div className="sticky bottom-0 -mx-5 -mb-4 flex gap-2 border-t border-slate-100 bg-white/95 px-5 py-3 backdrop-blur">
          <Button variant="outline" onClick={() => onDone()} disabled={isPending}>
            Отмена
          </Button>
          <Button type="submit" className="flex-1" loading={isPending}>
            {isEdit ? "Сохранить изменения" : "Добавить в парк"}
          </Button>
        </div>
      </form>
    </>
  );
}
