import { Boxes, FileText, LayoutDashboard, Route, ScanLine, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  badgeKey?: "oneWayOverdue" | "leaseAttention";
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Дашборд и аналитика", shortLabel: "Дашборд", icon: LayoutDashboard },
  { href: "/containers", label: "Реестр контейнеров", shortLabel: "Реестр", icon: Boxes },
  { href: "/one-way", label: "Контроль One-Way", shortLabel: "One-Way", icon: Route, badgeKey: "oneWayOverdue" },
  { href: "/leases", label: "Долгосрочная аренда", shortLabel: "Аренда", icon: FileText, badgeKey: "leaseAttention" },
  { href: "/inspector", label: "Терминальный инспектор", shortLabel: "Инспектор", icon: ScanLine },
];

export interface NavBadges {
  oneWayOverdue: number;
  leaseAttention: number;
}

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
