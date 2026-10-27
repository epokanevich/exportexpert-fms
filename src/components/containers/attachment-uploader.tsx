"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const ACCEPT = "image/png,image/jpeg,application/pdf";

/** Прикрепить фото EIR / акт к событию журнала. Тип и размер проверяет сервер (по сигнатуре файла, ≤ 5 МБ). */
export function AttachmentUploader({ eventId, label }: { eventId: string; label: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.set("eventId", eventId);
      body.set("file", file);
      const response = await fetch("/api/attachments", { method: "POST", body });
      const result = (await response.json().catch(() => ({ ok: false, error: "Сервер вернул некорректный ответ" }))) as { ok: boolean; error?: string; message?: string };
      if (result.ok) {
        toast.success(result.message ?? "Файл прикреплён");
        router.refresh();
      } else {
        toast.error(result.error ?? "Не удалось загрузить файл");
      }
    } catch {
      toast.error("Сервер недоступен. Повторите попытку.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        id={`att-${eventId}`}
        name="file"
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button type="button" variant="ghost" size="sm" loading={busy} onClick={() => input.current?.click()} aria-label={`Прикрепить файл к событию «${label}»`}>
        <Paperclip /> Файл
      </Button>
    </>
  );
}
