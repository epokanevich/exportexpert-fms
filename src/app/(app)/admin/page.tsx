import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { History, Users } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { NewUserButton, RoleSelect } from "@/components/admin/user-admin";
import { requireSession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { AUDIT_ACTION_LABELS, type AuditAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Администрирование" };

const AUDIT_PAGE_SIZE = 100;
const CHIP = "inline-flex min-h-11 items-center rounded-full px-3 text-xs font-medium sm:min-h-8";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const session = await requireSession();
  if (!can(session.role, "users:manage")) notFound();
  const { action } = await searchParams;
  const filter = action && action in AUDIT_ACTION_LABELS ? (action as AuditAction) : undefined;

  const canViewAudit = can(session.role, "audit:view");
  const [users, logs] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { email: "asc" }], select: { id: true, email: true, name: true, role: true } }),
    canViewAudit ? prisma.auditLog.findMany({ where: filter ? { action: filter } : undefined, orderBy: { createdAt: "desc" }, take: AUDIT_PAGE_SIZE }) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Администрирование" description="Пользователи, роли и аудит-журнал операций" actions={<NewUserButton />} />

      <Card className="mb-4 lg:mb-6">
        <CardHeader icon={<Users />} title="Пользователи" description="Смена роли завершает все сеансы пользователя" />
        <ul className="divide-y divide-slate-100">
          {users.map((u) => (
            <li key={u.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {u.name} {u.id === session.userId && <Badge tone="indigo">это вы</Badge>}
                </p>
                <p className="font-mono text-xs text-slate-500">{u.email}</p>
              </div>
              <RoleSelect userId={u.id} role={u.role} disabled={u.id === session.userId} label={`Роль пользователя ${u.email}`} />
            </li>
          ))}
        </ul>
      </Card>

      {canViewAudit && (
      <Card>
        <CardHeader icon={<History />} title="Аудит-журнал" description={`Последние ${AUDIT_PAGE_SIZE} операций: кто, когда, что`} />
        <nav aria-label="Фильтр аудит-журнала" className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 pb-3">
          <Link href="/admin" aria-current={!filter ? "page" : undefined} className={cn(CHIP, !filter ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")}>
            Все
          </Link>
          {(Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]).map((a) => (
            <Link key={a} href={`/admin?action=${a}`} aria-current={filter === a ? "page" : undefined} className={cn(CHIP, filter === a ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")}>
              {AUDIT_ACTION_LABELS[a]}
            </Link>
          ))}
        </nav>
        {logs.length === 0 ? (
          <EmptyState icon={<History />} title="Записей нет" description="Операции появятся здесь сразу после выполнения" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Аудит-журнал операций</caption>
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-2 font-medium">Когда</th>
                  <th scope="col" className="px-3 py-2 font-medium">Кто</th>
                  <th scope="col" className="px-3 py-2 font-medium">Операция</th>
                  <th scope="col" className="px-3 py-2 font-medium">Что</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-5 py-2 font-mono text-xs whitespace-nowrap text-slate-500">{formatDateTime(log.createdAt)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{log.actorName}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{AUDIT_ACTION_LABELS[log.action as AuditAction] ?? log.action}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      )}
    </>
  );
}
