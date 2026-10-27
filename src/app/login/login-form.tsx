"use client";

import { useActionState, useRef } from "react";
import { KeyRound, Mail, Zap } from "lucide-react";
import { loginAction, type LoginState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { ReviewerGuide } from "./reviewer-guide";

interface LoginFormProps {
  next?: string;
  /** Демо-доступ передаёт сервер, пока демо-режим не выключен (DEMO_MODE=false) — иначе пароля нет в клиентском бандле. */
  demo: { email: string; password: string } | null;
}

export function LoginForm({ next, demo }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(loginAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);

  /** Демо-вход; `target` — экран, на который перейти после входа (проверяется сервером). */
  function handleDemoLogin(target?: string) {
    if (!demo) return;
    if (emailRef.current) emailRef.current.value = demo.email;
    if (passwordRef.current) passwordRef.current.value = demo.password;
    if (nextRef.current && target) nextRef.current.value = target;
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <div className="mt-8 space-y-5">
        <form ref={formRef} action={formAction} className="space-y-4">
          <input ref={nextRef} type="hidden" name="next" defaultValue={next ?? ""} />
          <Field label="Email" htmlFor="email">
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input ref={emailRef} id="email" name="email" type="email" autoComplete="username" defaultValue={state.email ?? demo?.email ?? ""} required className="pl-9" />
            </div>
          </Field>
          <Field label="Пароль" htmlFor="password">
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input ref={passwordRef} id="password" name="password" type="password" autoComplete="current-password" defaultValue={demo?.password ?? ""} required className="pl-9" />
            </div>
          </Field>
          {state.error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
              {state.error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={isPending}>
            Войти
          </Button>
        </form>

        {demo && (
          <>
        <div className="relative py-1 text-center text-xs text-slate-400">
          <span className="absolute inset-x-0 top-1/2 h-px bg-slate-200" aria-hidden />
          <span className="relative bg-slate-50 px-3">или</span>
        </div>

        <Button variant="outline" size="lg" className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => handleDemoLogin()} disabled={isPending}>
          <Zap className="text-amber-500" aria-hidden />
          Быстрый демо-вход в 1 клик
        </Button>
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-500">
          Демо-доступ: <span className="font-mono text-slate-700">{demo.email}</span> / <span className="font-mono text-slate-700">{demo.password}</span>
        </div>
          </>
        )}
      </div>

      {demo && <ReviewerGuide onOpen={handleDemoLogin} disabled={isPending} />}
    </>
  );
}
