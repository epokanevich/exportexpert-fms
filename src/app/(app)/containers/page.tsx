import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { ContainerRegistry } from "@/components/containers/container-registry";
import { searchRegistry } from "@/lib/queries/registry";
import { parseRegistryQuery } from "@/lib/queries/registry-params";
import { businessToday } from "@/lib/business-time";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Реестр контейнеров" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ContainersPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseRegistryQuery(await searchParams);
  const result = await searchRegistry(query, businessToday());

  return (
    <>
      <PageHeader
        title="Реестр контейнеров"
        description={`База парка SOC: ${formatNumber(result.fleet.units)} ед. · ${formatNumber(result.fleet.teu)} TEU. Номер в строке открывает быстрый просмотр.`}
      />
      <ContainerRegistry key={query.q} rows={result.rows} total={result.total} pageCount={result.pageCount} query={query} />
    </>
  );
}
