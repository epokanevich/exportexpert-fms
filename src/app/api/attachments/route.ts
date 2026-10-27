import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { saveAttachment } from "@/lib/attachments/service";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments/validation";

/** Запас на служебные поля multipart сверх самого файла. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/** Загрузка вложения к событию журнала: multipart/form-data { eventId, file }. Только с сессией и правом «inspection». */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Войдите в систему" }, { status: 401 });
  if (!can(user.role, "inspection")) return NextResponse.json({ ok: false, error: "Недостаточно прав для этого действия" }, { status: 403 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_ATTACHMENT_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return NextResponse.json({ ok: false, error: "Файл больше 5 МБ" }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный запрос загрузки" }, { status: 400 });
  }
  const eventId = form.get("eventId");
  const file = form.get("file");
  if (typeof eventId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Выберите файл" }, { status: 400 });
  }
  try {
    const result = await saveAttachment({ eventId, file, uploadedBy: user });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, id: result.id, message: `Файл «${result.fileName}» прикреплён` }, { status: 201 });
  } catch (error) {
    console.error("[api:attachments]", error);
    return NextResponse.json({ ok: false, error: "Не удалось сохранить файл. Повторите попытку." }, { status: 500 });
  }
}
