import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { isDemoMode } from "@/lib/demo-mode";
import { getNavBadges } from "@/lib/queries/operations";

// Server Actions с облачной БД (в т.ч. «Сбросить демо-данные») — запас по времени для serverless-функций Vercel.
export const maxDuration = 60;

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const badges = await getNavBadges(new Date());
  return (
    <AppShell user={{ name: session.name, email: session.email, role: session.role }} badges={badges} canReset={isDemoMode() && can(session.role, "demo:reset")}>
      {children}
    </AppShell>
  );
}
