import type { Metadata } from "next";
import { Anchor, ShieldCheck, Timer, TrendingUp } from "lucide-react";
import { Brand } from "@/components/brand";
import { DEMO_CREDENTIALS, isDemoMode } from "@/lib/demo-mode";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход" };

const HIGHLIGHTS = [
  { icon: Timer, title: "Контроль One-Way", text: "Дедлайны возврата и детеншн считаются автоматически" },
  { icon: TrendingUp, title: "Экономика единицы", text: "ROI, ремонты и простой каждого контейнера" },
  { icon: Anchor, title: "Терминальный инспектор", text: "Осмотр и смена статуса со смартфона одной рукой" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="grid grid-cols-1 min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:self-start">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, #fff 0 2px, transparent 2px 18px), repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 120px)",
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-32 -bottom-32 size-[520px] rounded-full bg-indigo-600/30 blur-3xl" aria-hidden />
        <Brand inverted className="relative" />
        <div className="relative max-w-lg">
          <p className="font-mono text-xs tracking-[0.25em] text-indigo-300 uppercase">Fleet Management System</p>
          <h1 className="mt-4 text-4xl leading-tight font-semibold tracking-tight">
            Парк собственных контейнеров — под контролем в каждой точке маршрута
          </h1>
          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-5 text-indigo-300" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-sm text-slate-400">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative font-mono text-xs text-slate-500">EXPU · FESU · TKRU · RZDU — ISO 6346</p>
      </section>

      <section className="flex items-center justify-center bg-slate-50 px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <Brand className="mb-10 lg:hidden" />
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Вход в систему</h2>
          <p className="mt-1.5 text-sm text-slate-500">Используйте корпоративную учётную запись.</p>
          <LoginForm next={next} demo={isDemoMode() ? DEMO_CREDENTIALS : null} />
          <p className="mt-8 flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="size-4" aria-hidden />
            Сессия защищена JWT в httpOnly-cookie, срок — 8 часов.
          </p>
        </div>
      </section>
    </main>
  );
}
