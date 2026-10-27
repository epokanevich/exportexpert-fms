"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { changePasswordAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { useServerAction } from "@/components/use-server-action";

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function ChangePasswordForm() {
  const [values, setValues] = useState(EMPTY);
  const { run, isPending, fieldErrors } = useServerAction();
  const set = (key: keyof typeof values, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => changePasswordAction(values), () => setValues(EMPTY));
      }}
    >
      <Field label="Текущий пароль" htmlFor="pw-current" error={fieldErrors.currentPassword}>
        <Input id="pw-current" name="currentPassword" type="password" autoComplete="current-password" required value={values.currentPassword} onChange={(e) => set("currentPassword", e.target.value)} />
      </Field>
      <Field label="Новый пароль" htmlFor="pw-new" error={fieldErrors.newPassword} hint="Не короче 10 символов, не совпадает с email и текущим паролем">
        <Input id="pw-new" name="newPassword" type="password" autoComplete="new-password" required minLength={10} value={values.newPassword} onChange={(e) => set("newPassword", e.target.value)} />
      </Field>
      <Field label="Повторите новый пароль" htmlFor="pw-confirm" error={fieldErrors.confirmPassword}>
        <Input id="pw-confirm" name="confirmPassword" type="password" autoComplete="new-password" required value={values.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} />
      </Field>
      <Button type="submit" loading={isPending}>
        <KeyRound /> Сменить пароль
      </Button>
    </form>
  );
}
