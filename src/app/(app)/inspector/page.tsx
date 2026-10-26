import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { TerminalInspector } from "@/components/inspector/terminal-inspector";
import type { GateInTrip } from "@/components/one-way/gate-in-form";
import { getContainerRows } from "@/lib/queries/containers";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Терминальный инспектор" };

export default async function InspectorPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const now = new Date();
  const [rows, trips, leaseItems] = await Promise.all([
    getContainerRows(now),
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
  const leaseByContainer = Object.fromEntries(leaseItems.map((i) => [i.containerId, i.lease]));

  return (
    <>
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Терминальный инспектор" description="Поиск по номеру, акт осмотра и смена статуса — одной рукой со смартфона." />
      </div>
      <TerminalInspector rows={rows} tripsByContainer={tripsByContainer} leaseByContainer={leaseByContainer} initialId={id} />
    </>
  );
}
