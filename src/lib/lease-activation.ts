import "server-only";
import { prisma } from "@/lib/prisma";
import { businessToday } from "@/lib/business-time";
import { formatDate, formatUsd } from "@/lib/format";

/**
 * D-19: договоры SCHEDULED, у которых наступила дата On-Hire, переходят в ACTIVE, а их контейнеры —
 * из резерва в «Долгосрочную аренду». Вызывается при рендере защищённой зоны (ленивая активация без cron).
 * Идемпотентно и безопасно при параллельных вызовах: договор захватывается условием status = SCHEDULED.
 */
export async function activateDueLeases(now: Date = new Date()): Promise<number> {
  const today = businessToday(now);
  const due = await prisma.leaseContract.findMany({
    where: { status: "SCHEDULED", startDate: { lte: today } },
    select: { id: true },
  });
  let activated = 0;
  for (const { id } of due) {
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.leaseContract.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "ACTIVE", onHireSurvey: "SIGNED" } });
      if (claimed.count === 0) return false;
      const lease = await tx.leaseContract.findUniqueOrThrow({ where: { id }, include: { items: { include: { container: true } } } });
      for (const item of lease.items) {
        if (item.container.operationalStatus !== "RESERVED") continue;
        await tx.container.update({
          where: { id: item.containerId },
          data: {
            operationalStatus: "LONG_TERM_LEASE",
            currentTerminal: `В аренде: ${lease.lesseeName}`,
            storageStartDate: null,
            events: {
              create: {
                type: "LEASE_ON_HIRE",
                occurredAt: now,
                locode: item.container.currentLocode,
                terminal: item.container.currentTerminal,
                description: `On-Hire: передан в аренду ${lease.lesseeName} по договору ${lease.contractNumber} (с ${formatDate(lease.startDate)} по ${formatDate(lease.endDate)}), Per Diem ${formatUsd(lease.dailyRateUsd, 2)}.`,
                actor: "Система FMS",
              },
            },
          },
        });
      }
      return true;
    });
    if (done) activated += 1;
  }
  return activated;
}
