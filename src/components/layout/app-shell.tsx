"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { KeyRound, LogOut, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { logoutAction } from "@/actions/auth";
import { resetDemoDataAction } from "@/actions/demo";
import { Brand } from "@/components/brand";
import { Button, buttonClasses } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActivePath, type NavBadges } from "./nav-items";

interface AppShellProps {
  user: { name: string; email: string; role: string };
  /** Сброс демо-данных: ADMIN и демо-режим не выключен через DEMO_MODE=false (решает сервер). */
  canReset: boolean;
  badges: NavBadges;
  children: ReactNode;
}

const ROLE_LABELS: Record<string, string> = { ADMIN: "Администратор", MANAGER: "Менеджер парка", INSPECTOR: "Инспектор" };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function CountBadge({ value, tone }: { value: number; tone: "rose" | "amber" }) {
  if (value <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5 font-semibold text-white tabular",
        tone === "rose" ? "bg-rose-500" : "bg-amber-500",
      )}
    >
      {value}
    </span>
  );
}

function useProfileActions() {
  const [isResetting, startReset] = useTransition();
  const [isLoggingOut, startLogout] = useTransition();

  const reset = () =>
    startReset(async () => {
      const result = await resetDemoDataAction();
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  const logout = () => startLogout(() => logoutAction());
  return { reset, logout, isResetting, isLoggingOut };
}

function ProfileActions({ onDone, compact = false, canReset, isAdmin }: { onDone?: () => void; compact?: boolean; canReset: boolean; isAdmin: boolean }) {
  const { reset, logout, isResetting, isLoggingOut } = useProfileActions();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
        <p>Все изменения будут удалены, база вернётся к исходному демо-сценарию. Продолжить?</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="warning"
            loading={isResetting}
            onClick={() => {
              reset();
              setConfirming(false);
              onDone?.();
            }}
          >
            Да, сбросить
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Отмена
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-1")}>
      <Link href="/profile" onClick={onDone} className={buttonClasses("ghost", compact ? "sm" : "md", "justify-start")}>
        <KeyRound aria-hidden />
        Профиль и пароль
      </Link>
      {isAdmin && (
        <Link href="/admin" onClick={onDone} className={buttonClasses("ghost", compact ? "sm" : "md", "justify-start")}>
          <ShieldCheck aria-hidden />
          Пользователи и аудит
        </Link>
      )}
      {canReset && (
        <Button variant="outline" size={compact ? "sm" : "md"} className="h-auto min-h-8 justify-start py-1.5 text-left whitespace-normal" loading={isResetting} onClick={() => setConfirming(true)}>
          <RotateCcw aria-hidden />
          Сбросить демо-данные к исходным
        </Button>
      )}
      <Button variant="ghost" size={compact ? "sm" : "md"} className="justify-start text-rose-600 hover:bg-rose-50 hover:text-rose-700" loading={isLoggingOut} onClick={logout}>
        <LogOut aria-hidden />
        Выйти
      </Button>
    </div>
  );
}

export function AppShell({ user, badges, canReset, children }: AppShellProps) {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const current = NAV_ITEMS.find((i) => isActivePath(pathname, i.href));

  return (
    <div className="min-h-dvh">
      {/* ── ПК: фиксированный сайдбар ── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col bg-slate-950 text-slate-300 lg:flex">
        <div className="px-5 pt-5 pb-6">
          <Brand inverted />
        </div>
        <nav aria-label="Основная навигация" className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            const count = item.badgeKey ? badges[item.badgeKey] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white",
                )}
              >
                {active && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-indigo-400" aria-hidden />}
                <item.icon className={cn("size-4", active ? "text-indigo-300" : "text-slate-500 group-hover:text-slate-300")} aria-hidden />
                <span className="flex-1 truncate">{item.label}</span>
                <CountBadge value={count} tone={item.badgeKey === "oneWayOverdue" ? "rose" : "amber"} />
              </Link>
            );
          })}
        </nav>
        <div className="m-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-semibold text-indigo-200">{initials(user.name)}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="truncate text-xs text-slate-400">{user.email}</p>
            </div>
          </div>
          <div className="[&_button]:w-full [&_button]:border-white/10 [&_button]:bg-transparent [&_button]:text-slate-300 [&_button:hover]:bg-white/10 [&_button:hover]:text-white">
            <ProfileActions compact canReset={canReset} isAdmin={user.role === "ADMIN"} />
          </div>
        </div>
      </aside>

      {/* ── Телефон / планшет: верхний хедер ── */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Brand className="[&>span:last-child]:hidden sm:[&>span:last-child]:block" />
          {current && <span className="truncate text-sm font-semibold text-slate-900 sm:hidden">{current.shortLabel}</span>}
        </div>
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="flex size-11 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-100"
        >
          {initials(user.name) || <UserRound className="size-5" aria-hidden />}
          <span className="sr-only"> профиль и настройки</span>
        </button>
      </header>

      <main className="pb-24 lg:pb-10 lg:pl-72">
        <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      {/* ── Телефон / планшет: нижний таб-бар ── */}
      <nav aria-label="Нижняя навигация" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            const count = item.badgeKey ? badges[item.badgeKey] : 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-indigo-600" : "text-slate-500")}
                >
                  {active && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-indigo-600" aria-hidden />}
                  <span className="relative">
                    <item.icon className="size-6" aria-hidden />
                    {count > 0 && (
                      <span
                        className={cn(
                          "absolute -top-1.5 -right-2.5 min-w-4 rounded-full px-1 text-[10px] leading-4 font-semibold text-white ring-2 ring-white",
                          item.badgeKey === "oneWayOverdue" ? "bg-rose-500" : "bg-amber-500",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                  {item.shortLabel}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Sheet open={profileOpen} onClose={() => setProfileOpen(false)} title={user.name} description={`${user.email} · ${ROLE_LABELS[user.role] ?? user.role}`}>
        <ProfileActions onDone={() => setProfileOpen(false)} canReset={canReset} isAdmin={user.role === "ADMIN"} />
      </Sheet>
    </div>
  );
}
