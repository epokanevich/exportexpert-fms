"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClipboardCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { addContainerEventAction, deleteContainerAction } from "@/actions/containers";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useServerAction } from "@/components/use-server-action";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/domain/constants";
import { toLocalDateInput } from "@/lib/dates";
import { ContainerForm, type ContainerFormValues } from "./container-form";

interface ContainerProfileActionsProps {
  containerId: string;
  bicLabel: string;
  formValues: ContainerFormValues;
  canDelete: boolean;
  /** Права роли (сервер проверяет их повторно): правка и журнал — fleet:edit, списание — fleet:delete. */
  canEdit: boolean;
  canWriteOff: boolean;
}

export function ContainerProfileActions({ containerId, bicLabel, formValues, canDelete, canEdit, canWriteOff }: ContainerProfileActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deletion = useServerAction();

  if (!canEdit && !canWriteOff) return null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:flex">
        {canEdit && (
          <>
            <Button variant="outline" onClick={() => setEventOpen(true)}>
              <Plus /> <span className="truncate">Событие</span>
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> <span className="truncate">Изменить</span>
            </Button>
          </>
        )}
        {canWriteOff && (
        <Button variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setDeleteOpen(true)}>
          <Trash2 /> <span className="truncate">Списать</span>
        </Button>
        )}
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={`Редактирование ${bicLabel}`} size="lg">
        <ContainerForm containerId={containerId} initial={formValues} onDone={() => setEditOpen(false)} />
      </Sheet>

      <Sheet open={eventOpen} onClose={() => setEventOpen(false)} title="Запись в журнал" description="Акт осмотра, ремонт, перемещение или иное событие">
        <EventForm containerId={containerId} onDone={() => setEventOpen(false)} />
      </Sheet>

      <Sheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Списать ${bicLabel}?`}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Отмена</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!canDelete}
              loading={deletion.isPending}
              onClick={() => deletion.run(() => deleteContainerAction(containerId), () => router.push("/containers"))}
            >
              Списать из парка
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          {canDelete
            ? "Контейнер и вся его история (события, рейсы One-Way, строки договоров аренды) будут удалены из базы. Действие необратимо."
            : "Контейнер в активном One-Way, аренде или по нему открыта претензия. Сначала оформите возврат (Gate-In / Off-Hire) или урегулируйте претензию."}
        </p>
      </Sheet>
    </>
  );
}

function EventForm({ containerId, onDone }: { containerId: string; onDone: () => void }) {
  const [type, setType] = useState<string>("INSPECTION");
  const [occurredAt, setOccurredAt] = useState(toLocalDateInput());
  const [description, setDescription] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const { run, isPending, fieldErrors } = useServerAction();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addContainerEventAction(containerId, { type: type as (typeof EVENT_TYPES)[number], occurredAt, description, amountUsd }), onDone);
      }}
    >
      <Field label="Тип события" htmlFor="ev-type" error={fieldErrors.type}>
        <Select id="ev-type" value={type} onChange={(e) => setType(e.target.value)}>
          {EVENT_TYPES.filter((t) => t !== "PURCHASE").map((t) => (
            <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата" htmlFor="ev-date" error={fieldErrors.occurredAt}>
          <Input id="ev-date" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </Field>
        <Field label="Сумма, $" htmlFor="ev-amount" hint="Необязательно" error={fieldErrors.amountUsd}>
          <Input id="ev-amount" type="number" inputMode="decimal" min={0} value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} />
        </Field>
      </div>
      <Field label="Описание" htmlFor="ev-desc" error={fieldErrors.description}>
        <Textarea id="ev-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Например: осмотр на ВМТП, повреждений не выявлено" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={isPending}>
        <ClipboardCheck /> Сохранить в журнал
      </Button>
    </form>
  );
}
