import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { LeaseList } from "@/components/leases/lease-list";
import { getLeaseRows } from "@/lib/queries/operations";
import { getIssuableContainers } from "@/lib/queries/containers";
import { businessToday } from "@/lib/business-time";

export const metadata: Metadata = { title: "Долгосрочная аренда" };

export default async function LeasesPage() {
  const [leases, issuable] = await Promise.all([getLeaseRows(businessToday()), getIssuableContainers()]);
  return (
    <>
      <PageHeader title="Долгосрочная аренда" description="Long-Term Lease: договоры, начисления Per Diem, контроль сроков и оплаты." />
      <LeaseList leases={leases} issuable={issuable} />
    </>
  );
}
