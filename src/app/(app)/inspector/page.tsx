import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { TerminalInspector } from "@/components/inspector/terminal-inspector";
import type { GateInTrip } from "@/components/one-way/gate-in-form";
import { getContainerRows } from "@/lib/queries/containers";
import { prisma } from "@/lib/prisma";
import { searchRegistry } from "@/lib/queries/registry";
import { parseRegistryQuery } from "@/lib/queries/registry-params";
import { businessToday } from "@/lib/business-time";

export const metadata: Metadata = { title: "Терминальный инспектор" };

export default async function InspectorPage({ searchParams }: { searchParams: Promise<{ id?: string; q?: string }> }) {
  const params = await searchParams;
  const id = params.id;
  const query = parseRegistryQuery({ q: params.q ?? "" });
  const now = businessToday();
  // Поиск на сервере (4.4): в браузер уходят только совпадения и выбранная единица, а не весь парк.
  const [found, selectedRows, trips, leaseItems] = await Promise.all([
    query.q ? searchRegistry(query, now).then((r) => r.rows) : Promise.resolve([]),
    id ? getContainerRows(now, { id }) : Promise.resolve([]),
    prisma.oneWayTrip.findMany({ where: { status: "ACTIVE" } }),
    prisma.leaseItem.findMany({ where: { offHireDate: null, lease: { status: "ACTIVE" } }, include: { lease: { select: { id: true, contractNumber: true } } } }),
  ]);

  const tripsByContainer: Record<string, GateInTrip> = Object.fromEntries(
    trips.map((t) => [
      t.containerId,
      {
        id: t.id,
        bookingRef: t.bookingRef,
        dropoffLocode: t.dropoffLocode,
        dropoffTerminal: t.dropoffTerminal,
        handoverDate: t.handoverDate,
        deadlineDate: t.deadlineDate,
        freeDays: t.freeDays,
        detentionRatePerDayUsd: t.detentionRatePerDayUsd,
      },
    ]),
  );
  const rows = [...selectedRows, ...found.filter((r) => r.id !== id)];
  const leaseByContainer = Object.fromEntries(leaseItems.map((i) => [i.containerId, i.lease]));

  return (
    <>
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Терминальный инспектор" description="Поиск по номеру, акт осмотра и смена статуса — одной рукой со смартфона." />
      </div>
      <TerminalInspector key={query.q} rows={rows} initialQuery={params.q ?? ""} tripsByContainer={tripsByContainer} leaseByContainer={leaseByContainer} initialId={id} />
    </>
  );
}
