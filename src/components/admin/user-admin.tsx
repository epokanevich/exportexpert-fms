"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { changeUserRoleAction, createUserAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useServerAction } from "@/components/use-server-action";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/permissions";

export function RoleSelect({ userId, role, disabled, label }: { userId: string; role: string; disabled: boolean; label: string }) {
  const [value, setValue] = useState(role);
  const { run, isPending } = useServerAction();
  return (
    <div className="flex items-center gap-2">
      <Select id={`role-${userId}`} name="role" aria-label={label} value={value} disabled={disabled || isPending} onChange={(e) => setValue(e.target.value)} className="min-w-44">
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Select>
      {value !== role && (
        <Button size="sm" loading={isPending} onClick={() => run(() => changeUserRoleAction(userId, { role: value as Role }))}>
          Сохранить
        </Button>
      )}
    </div>
  );
}

const EMPTY_USER = { email: "", name: "", role: "INSPECTOR", password: "" };

export function NewUserButton() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY_USER);
  const { run, isPending, fieldErrors } = useServerAction();
  const set = (key: keyof typeof values, value: string) => setValues((prev) => ({ ...prev, [key]: value }));
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus /> Новый пользователь
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Новый пользователь" description="Временный пароль передайте лично — пользователь сменит его в профиле">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => createUserAction({ ...values, role: values.role as Role }),
              () => {
                setOpen(false);
                setValues(EMPTY_USER);
              },
            );
          }}
        >
          <Field label="Email" htmlFor="nu-email" error={fieldErrors.email}>
            <Input id="nu-email" name="email" type="email" autoComplete="off" required value={values.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Имя" htmlFor="nu-name" error={fieldErrors.name}>
            <Input id="nu-name" name="name" required value={values.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Роль" htmlFor="nu-role" error={fieldErrors.role}>
            <Select id="nu-role" name="role" value={values.role} onChange={(e) => set("role", e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Временный пароль" htmlFor="nu-password" error={fieldErrors.password} hint="Не короче 10 символов">
            <Input id="nu-password" name="password" type="password" autoComplete="new-password" required minLength={10} value={values.password} onChange={(e) => set("password", e.target.value)} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={isPending}>
            <UserPlus /> Создать
          </Button>
        </form>
      </Sheet>
    </>
  );
}
