import { CircleCheck, Clock, Flame, ShieldAlert, TriangleAlert, Wrench } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/primitives";
import {
  CONDITION_GRADE_LABELS,
  CONDITION_GRADE_SHORT,
  OPERATIONAL_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  TECH_STATUS_LABELS,
  TRIP_STATUS_LABELS,
  isOneOf,
  CONDITION_GRADES,
  OPERATIONAL_STATUSES,
  PAYMENT_STATUSES,
  TECH_STATUSES,
  TRIP_STATUSES,
} from "@/lib/domain/constants";
import type { CscState } from "@/lib/domain/container";
import type { LeaseExpiryLevel } from "@/lib/domain/lease";
import { formatBic } from "@/lib/iso6346";
import { formatDays } from "@/lib/format";
import { cn } from "@/lib/utils";

const OPERATIONAL_TONES: Record<string, BadgeTone> = {
  AVAILABLE: "emerald",
  ONE_WAY: "indigo",
  LONG_TERM_LEASE: "violet",
  IN_TRANSIT: "sky",
  MAINTENANCE: "orange",
};

export function OperationalStatusBadge({ status }: { status: string }) {
  const label = isOneOf(OPERATIONAL_STATUSES, status) ? OPERATIONAL_STATUS_LABELS[status] : status;
  return (
    <Badge tone={OPERATIONAL_TONES[status] ?? "slate"} dot>
      {label}
    </Badge>
  );
}

const TECH_TONES: Record<string, BadgeTone> = { SOUND: "emerald", DAMAGED: "rose", IN_REPAIR: "amber", HOLD: "slate" };
const TECH_ICONS = { SOUND: CircleCheck, DAMAGED: TriangleAlert, IN_REPAIR: Wrench, HOLD: ShieldAlert } as const;

export function TechStatusBadge({ status }: { status: string }) {
  if (!isOneOf(TECH_STATUSES, status)) return <Badge>{status}</Badge>;
  const Icon = TECH_ICONS[status];
  return (
    <Badge tone={TECH_TONES[status]}>
      <Icon aria-hidden />
      {TECH_STATUS_LABELS[status]}
    </Badge>
  );
}

const GRADE_TONES: Record<string, BadgeTone> = { IICL6: "emerald", CW: "sky", WWT: "amber", DAMAGED: "rose" };

export function GradeBadge({ grade, full = false }: { grade: string; full?: boolean }) {
  if (!isOneOf(CONDITION_GRADES, grade)) return <Badge>{grade}</Badge>;
  return (
    <Badge tone={GRADE_TONES[grade]} title={CONDITION_GRADE_LABELS[grade]} className="font-mono">
      {full ? CONDITION_GRADE_LABELS[grade] : CONDITION_GRADE_SHORT[grade]}
    </Badge>
  );
}

const TRIP_TONES: Record<string, BadgeTone> = { ACTIVE: "indigo", OVERDUE: "rose", COMPLETED: "emerald", DISPUTE: "amber" };

export function TripStatusBadge({ status }: { status: string }) {
  const label = isOneOf(TRIP_STATUSES, status) ? TRIP_STATUS_LABELS[status] : status;
  return (
    <Badge tone={TRIP_TONES[status] ?? "slate"} dot>
      {label}
    </Badge>
  );
}

const PAYMENT_TONES: Record<string, BadgeTone> = { PAID: "emerald", PENDING: "amber", OVERDUE: "rose" };

export function PaymentBadge({ status }: { status: string }) {
  const label = isOneOf(PAYMENT_STATUSES, status) ? PAYMENT_STATUS_LABELS[status] : status;
  return (
    <Badge tone={PAYMENT_TONES[status] ?? "slate"} dot>
      {label}
    </Badge>
  );
}

export function CscBadge({ csc, compact = false }: { csc: CscState; compact?: boolean }) {
  if (csc.level === "OK") return null;
  if (csc.level === "EXPIRED") {
    return (
      <Badge tone="rose" title={`Табличка КБК просрочена на ${formatDays(-csc.daysLeft)}`}>
        <ShieldAlert aria-hidden />
        {compact ? `−${formatDays(-csc.daysLeft)}` : `КБК просрочена ${formatDays(-csc.daysLeft)}`}
      </Badge>
    );
  }
  return (
    <Badge tone="amber" title={`До истечения КБК ${formatDays(csc.daysLeft)}`}>
      <Clock aria-hidden />
      {compact ? formatDays(csc.daysLeft) : `КБК: ${formatDays(csc.daysLeft)}`}
    </Badge>
  );
}

export function LeaseExpiryBadge({ level, daysToEnd }: { level: LeaseExpiryLevel; daysToEnd: number }) {
  switch (level) {
    case "EXPIRED":
      return <Badge tone="rose">Срок истёк {formatDays(-daysToEnd)} назад</Badge>;
    case "CRITICAL":
      return (
        <Badge tone="rose">
          <Flame aria-hidden />
          Истекает через {formatDays(daysToEnd)}
        </Badge>
      );
    case "WARNING":
      return <Badge tone="amber">Истекает через {formatDays(daysToEnd)}</Badge>;
    case "CLOSED":
      return <Badge tone="slate">Закрыт</Badge>;
    default:
      return null;
  }
}

/** Номер контейнера моноширинным шрифтом: EXPU 402918-9 (контрольная цифра выделена). */
export function BicCode({ code, className, size = "md" }: { code: string; className?: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const formatted = formatBic(code);
  const [main, check] = formatted.split("-");
  return (
    <span
      className={cn(
        "font-mono font-semibold tracking-tight whitespace-nowrap text-slate-900",
        { sm: "text-xs", md: "text-sm", lg: "text-base", xl: "text-2xl sm:text-3xl" }[size],
        className,
      )}
    >
      {main}
      {check !== undefined && (
        <>
          <span className="text-slate-400">-</span>
          <span className="rounded bg-slate-900 px-[0.2em] text-white">{check}</span>
        </>
      )}
    </span>
  );
}
