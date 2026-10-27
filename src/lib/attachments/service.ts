import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { attachmentsDir, createDatabaseStorage, createLocalDiskStorage, newStorageKey, resolveStorageDriver, type AttachmentStorage } from "./storage";
import { MAX_ATTACHMENT_BYTES, validateUpload } from "./validation";

let storage: AttachmentStorage | null = null;

export function getAttachmentStorage(): AttachmentStorage {
  if (!storage) storage = resolveStorageDriver() === "db" ? createDatabaseStorage(prisma) : createLocalDiskStorage(attachmentsDir());
  return storage;
}

export type SaveResult = { ok: true; id: string; fileName: string } | { ok: false; status: number; error: string };

/** Сохраняет файл в хранилище и строку Attachment. При ошибке записи в БД файл удаляется из хранилища. */
export async function saveAttachment(params: { eventId: string; file: File; uploadedBy: { id: string; name: string } }): Promise<SaveResult> {
  const event = await prisma.containerEvent.findUnique({
    where: { id: params.eventId },
    select: { id: true, containerId: true, container: { select: { deletedAt: true } } },
  });
  if (!event) return { ok: false, status: 404, error: "Событие не найдено" };
  if (event.container.deletedAt) return { ok: false, status: 409, error: "Контейнер списан — вложения не добавляются" };

  if (params.file.size > MAX_ATTACHMENT_BYTES) return { ok: false, status: 413, error: "Файл больше 5 МБ" };
  const data = Buffer.from(await params.file.arrayBuffer());
  const check = validateUpload({ name: params.file.name, size: params.file.size }, data);
  if (!check.ok) return { ok: false, status: 422, error: check.error };

  const store = getAttachmentStorage();
  const key = newStorageKey();
  await store.put(key, data);
  try {
    const row = await prisma.attachment.create({
      data: {
        containerId: event.containerId,
        eventId: event.id,
        fileName: check.fileName,
        mimeType: check.mimeType,
        sizeBytes: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
        storageKey: key,
        uploadedById: params.uploadedBy.id,
      },
    });
    return { ok: true, id: row.id, fileName: row.fileName };
  } catch (error) {
    await store.delete(key).catch(() => undefined);
    throw error;
  }
}

export async function loadAttachment(id: string) {
  const row = await prisma.attachment.findUnique({ where: { id } });
  if (!row) return null;
  const data = await getAttachmentStorage().get(row.storageKey);
  return data ? { row, data } : null;
}
