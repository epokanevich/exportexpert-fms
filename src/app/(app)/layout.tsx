import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/lib/auth/dal";
import { getNavBadges } from "@/lib/queries/operations";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const badges = await getNavBadges(new Date());
  return (
    <AppShell user={{ name: session.name, email: session.email, role: session.role }} badges={badges}>
      {children}
    </AppShell>
  );
}
