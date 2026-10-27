import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  ClipboardCheck,
  FileText,
  PackageCheck,
  Repeat,
  Route,
  ShieldCheck,
  ShoppingCart,
  Undo2,
  Wrench,
  Paperclip,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { EVENT_TYPE_LABELS, isOneOf, EVENT_TYPES, locodeCity } from "@/lib/domain/constants";
import { formatDateTime, formatFileSize, formatUsd } from "@/lib/format";
import { AttachmentUploader } from "./attachment-uploader";
import { cn } from "@/lib/utils";
import type { ContainerEventDto } from "@/lib/queries/containers";

const EVENT_STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  PURCHASE: { icon: ShoppingCart, tone: "bg-slate-900 text-white" },
  GATE_IN: { icon: ArrowDownToLine, tone: "bg-emerald-100 text-emerald-700" },
  GATE_OUT: { icon: ArrowUpFromLine, tone: "bg-sky-100 text-sky-700" },
  ONE_WAY_OUT: { icon: Route, tone: "bg-indigo-100 text-indigo-700" },
  ONE_WAY_IN: { icon: Undo2, tone: "bg-indigo-100 text-indigo-700" },
  LEASE_ON_HIRE: { icon: FileText, tone: "bg-violet-100 text-violet-700" },
  LEASE_OFF_HIRE: { icon: PackageCheck, tone: "bg-violet-100 text-violet-700" },
  LEASE_EXTENDED: { icon: Repeat, tone: "bg-violet-100 text-violet-700" },
  INSPECTION: { icon: ClipboardCheck, tone: "bg-amber-100 text-amber-700" },
  REPAIR_START: { icon: Wrench, tone: "bg-orange-100 text-orange-700" },
  REPAIR_DONE: { icon: BadgeCheck, tone: "bg-emerald-100 text-emerald-700" },
  STATUS_CHANGE: { icon: Repeat, tone: "bg-slate-100 text-slate-600" },
  CSC_RENEWAL: { icon: ShieldCheck, tone: "bg-teal-100 text-teal-700" },
  WRITE_OFF: { icon: Trash2, tone: "bg-slate-200 text-slate-700" },
};

interface EventTimelineProps {
  events: ContainerEventDto[];
  compact?: boolean;
  /** Показывать кнопку «Файл» у событий (право inspection, контейнер не списан). */
  canUpload?: boolean;
}

export function EventTimeline({ events, compact = false, canUpload = false }: EventTimelineProps) {
  if (events.length === 0) return <p className="text-sm text-slate-500">Событий пока нет</p>;
  return (
    <ol className="relative">
      {events.map((event, index) => {
        const style = EVENT_STYLE[event.type] ?? EVENT_STYLE.STATUS_CHANGE;
        const Icon = style.icon;
        const label = isOneOf(EVENT_TYPES, event.type) ? EVENT_TYPE_LABELS[event.type] : event.type;
        const isLast = index === events.length - 1;
        return (
          <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && <span className="absolute top-8 bottom-0 left-[15px] w-px bg-slate-200" aria-hidden />}
            <span className={cn("relative flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white", style.tone)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <time className="font-mono text-xs text-slate-500 tabular" dateTime={new Date(event.occurredAt).toISOString()}>
                  {formatDateTime(event.occurredAt)}
                </time>
              </div>
              <p className={cn("mt-0.5 text-sm text-slate-600", compact && "line-clamp-2")}>{event.description}</p>
              {!compact && (
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                  {event.locode && (
                    <span>
                      <span className="font-mono">{event.locode}</span> · {locodeCity(event.locode)}
                      {event.terminal ? `, ${event.terminal}` : ""}
                    </span>
                  )}
                  {event.actor && <span>{event.actor}</span>}
                  {event.amountUsd ? <span className="font-mono text-slate-500">{formatUsd(event.amountUsd)}</span> : null}
                </p>
              )}
              {!compact && (event.attachments?.length || canUpload) ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {event.attachments?.map((a) => (
                    <a
                      key={a.id}
                      href={`/api/attachments/${a.id}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex min-h-11 items-center gap-1 rounded-md bg-slate-100 px-2.5 text-xs text-slate-700 hover:bg-slate-200 sm:min-h-8"
                    >
                      <Paperclip className="size-3.5" aria-hidden /> {a.fileName} <span className="text-slate-500">· {formatFileSize(a.sizeBytes)}</span>
                    </a>
                  ))}
                  {canUpload && <AttachmentUploader eventId={event.id} label={label} />}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
