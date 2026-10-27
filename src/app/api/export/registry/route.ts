import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { businessToday } from "@/lib/business-time";
import { buildCsv, csvFilename } from "@/lib/csv";
import { REGISTRY_CSV_COLUMNS } from "@/lib/export-columns";
import { searchRegistryAll } from "@/lib/queries/registry";
import { parseRegistryQuery } from "@/lib/queries/registry-params";

/** CSV всей выборки реестра по текущим фильтрам (а не одной страницы). Только по сессии. */
export async function GET(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Войдите в систему" }, { status: 401 });
  const query = parseRegistryQuery(request.nextUrl.searchParams);
  const rows = await searchRegistryAll(query, businessToday());
  const csv = buildCsv(rows, REGISTRY_CSV_COLUMNS);
  const name = csvFilename("fms-registry");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
