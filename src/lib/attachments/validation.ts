/** Проверка загружаемых вложений (2.6): размер ≤ 5 МБ, тип — только по сигнатуре содержимого. */

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const ATTACHMENT_MIME_TYPES = ["image/png", "image/jpeg", "application/pdf"] as const;
export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

const SIGNATURES: { mime: AttachmentMimeType; bytes: number[] }[] = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
];

export function detectMimeType(data: Uint8Array): AttachmentMimeType | null {
  const match = SIGNATURES.find((s) => s.bytes.every((b, i) => data[i] === b));
  return match?.mime ?? null;
}

export type UploadCheck = { ok: true; mimeType: AttachmentMimeType; fileName: string } | { ok: false; error: string };

/** Имя файла: без пути и управляющих символов, не длиннее 120 символов. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").replace(/^\.+/, "").trim();
  return (clean || "файл").slice(0, 120);
}

export function validateUpload(file: { name: string; size: number }, data: Uint8Array): UploadCheck {
  if (data.length === 0 || file.size === 0) return { ok: false, error: "Файл пустой" };
  if (data.length > MAX_ATTACHMENT_BYTES || file.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: "Файл больше 5 МБ" };
  if (data.length !== file.size) return { ok: false, error: "Файл передан не полностью — повторите загрузку" };
  const mimeType = detectMimeType(data);
  if (!mimeType) return { ok: false, error: "Допустимы только PNG, JPEG и PDF (тип определяется по содержимому файла)" };
  return { ok: true, mimeType, fileName: sanitizeFileName(file.name) };
}

/** Content-Disposition с ASCII-запасным именем и UTF-8 по RFC 5987. */
export function contentDisposition(fileName: string, type: "inline" | "attachment"): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "").replace(/\s+/g, " ").trim() || "file";
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
