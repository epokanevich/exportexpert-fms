"use client";

import { ArrowRight, Calculator, Compass, Gauge, ShieldAlert, Smartphone, SpellCheck2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface GuideItem {
  icon: LucideIcon;
  title: string;
  text: string;
  target: string;
  tone: string;
}

const GUIDE: readonly GuideItem[] = [
  {
    icon: SpellCheck2,
    title: "Живой расчёт ISO 6346",
    text: "Реестр → «Добавить»: контрольная цифра BIC считается при вводе, ошибка исправляется кнопкой «Подставить».",
    target: "/containers",
    tone: "bg-indigo-50 text-indigo-600",
  },
  {
    icon: ShieldAlert,
    title: "Авто-блокировка выдачи по КБК (CSC)",
    text: "EXPU 401890-2 исправен, но табличка просрочена — недоступен для One-Way, аренды и Gate-Out.",
    target: "/one-way",
    tone: "bg-rose-50 text-rose-600",
  },
  {
    icon: Gauge,
    title: "Детеншн и претензии EOR в One-Way",
    text: "2 просрочки с капающим детеншном, Gate-In с актом приёмки, претензия по FESU 516877-3, печатный Release Order.",
    target: "/one-way",
    tone: "bg-amber-50 text-amber-600",
  },
  {
    icon: Calculator,
    title: "Калькулятор Per Diem в аренде",
    text: "Начисления за месяц, срок или период по каждой единице; продление, Off-Hire только в разрешённые регионы.",
    target: "/leases",
    tone: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: Smartphone,
    title: "Мобильный терминальный инспектор",
    text: "Откройте на телефоне, найдите «9930» и закройте ремонт одним тапом — EOR уйдёт в затраты.",
    target: "/inspector",
    tone: "bg-sky-50 text-sky-600",
  },
];

interface ReviewerGuideProps {
  onOpen: (target: string) => void;
  disabled: boolean;
}

/** Компактный путеводитель по отраслевым фишкам: каждая кнопка — демо-вход сразу на нужный экран. */
export function ReviewerGuide({ onOpen, disabled }: ReviewerGuideProps) {
  return (
    <section aria-labelledby="reviewer-guide" className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-900 px-4 py-3 text-white">
        <h3 id="reviewer-guide" className="flex items-center gap-2 text-sm font-semibold">
          <Compass className="size-4 text-indigo-300" aria-hidden />
          Гид для проверяющего
        </h3>
        <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] text-indigo-200">5 отраслевых фишек</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {GUIDE.map((item) => (
          <li key={item.title}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onOpen(item.target)}
              className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              <span className={`mt-0.5 rounded-lg p-1.5 ${item.tone}`}>
                <item.icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{item.text}</span>
              </span>
              <span className="mt-1 flex shrink-0 items-center gap-1 text-[11px] font-medium text-indigo-600 opacity-70 transition group-hover:opacity-100">
                <span className="hidden xs:inline">Открыть</span>
                <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px] text-slate-500">
        Ещё: выгрузка в Excel (CSV) на трёх экранах, адаптив ПК / планшет / телефон, «Сбросить демо-данные» в профиле.
      </p>
    </section>
  );
}
