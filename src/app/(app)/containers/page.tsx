import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { ContainerRegistry, type RegistryFilters } from "@/components/containers/container-registry";
import { getContainerRows } from "@/lib/queries/containers";
import { teuOf } from "@/lib/domain/constants";

export const metadata: Metadata = { title: "Реестр контейнеров" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function ContainersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rows = await getContainerRows(new Date());
  const initialFilters: Partial<RegistryFilters> = {
    q: first(params.q),
    status: first(params.status),
    locode: first(params.locode),
    size: first(params.size),
    tech: first(params.tech),
    attention: first(params.attention) === "1",
  };
  const teu = rows.reduce((s, r) => s + teuOf(r.sizeType), 0);

  return (
    <>
      <PageHeader title="Реестр контейнеров" description={`База парка SOC: ${rows.length} ед. · ${teu} TEU. Нажмите на строку для быстрого просмотра.`} />
      {/* key: при переходе по ссылке с другими фильтрами состояние пересоздаётся */}
      <ContainerRegistry key={JSON.stringify(initialFilters)} rows={rows} initialFilters={initialFilters} />
    </>
  );
}
