import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadAttachment } from "@/lib/attachments/service";
import { contentDisposition } from "@/lib/attachments/validation";

/** Выдача вложения только по действующей сессии. Картинки — inline, PDF — скачиванием; содержимое изолировано CSP sandbox. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Войдите в систему" }, { status: 401 });
  const { id } = await params;
  const found = await loadAttachment(id);
  if (!found) return NextResponse.json({ ok: false, error: "Файл не найден" }, { status: 404 });
  const { row, data } = found;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": contentDisposition(row.fileName, row.mimeType === "application/pdf" ? "attachment" : "inline"),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
