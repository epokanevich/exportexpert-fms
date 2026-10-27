import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, DataList, PageHeader } from "@/components/ui/primitives";
import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { requireSession } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Профиль" };

export default async function ProfilePage() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, name: true, role: true, passwordChangedAt: true },
  });
  if (!user) notFound();
  return (
    <>
      <PageHeader title="Профиль" description="Учётная запись и безопасность входа" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <Card>
          <CardHeader icon={<UserRound />} title="Учётная запись" />
          <CardContent>
            <DataList
              items={[
                { label: "Имя", value: user.name },
                { label: "Email", value: user.email, mono: true },
                { label: "Роль", value: ROLE_LABELS[user.role] ?? user.role },
                { label: "Пароль изменён", value: user.passwordChangedAt ? formatDateTime(user.passwordChangedAt) : "ещё не менялся" },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader icon={<ShieldCheck />} title="Смена пароля" description="После смены сеансы на других устройствах завершатся" />
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
