import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { OneWayBoard } from "@/components/one-way/one-way-board";
import { getTripRows } from "@/lib/queries/operations";
import { getIssuableContainers } from "@/lib/queries/containers";
import { businessToday } from "@/lib/business-time";

export const metadata: Metadata = { title: "Контроль One-Way" };

export default async function OneWayPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = await searchParams;
  const now = businessToday();
  const [trips, issuable] = await Promise.all([getTripRows(now), getIssuableContainers()]);

  return (
    <>
      <PageHeader
        title="Контроль One-Way"
        description="Разовая выдача и репозиционирование: контейнер выдаётся в точке A и должен быть сдан порожним в нашем депо в точке B до истечения свободных дней."
      />
      <OneWayBoard key={focus ?? "board"} trips={trips} issuable={issuable} focusId={focus} />
    </>
  );
}
