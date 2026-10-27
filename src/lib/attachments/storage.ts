/**
 * Хранилище вложений — абстракция (2.6). Драйверы:
 *  local — каталог на диске вне public (ATTACHMENTS_DIR, по умолчанию .data/attachments) — для разработки;
 *  db    — таблица AttachmentBlob в PostgreSQL — для прода без объектного хранилища (Render + Neon):
 *          файлы ≤ 5 МБ, переживают передеплой, бэкапятся вместе с БД.
 * S3-совместимый драйвер и Vercel Blob (private) подключаются реализацией того же интерфейса — см. docs/ARCHITECTURE.md.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AttachmentStorage {
  readonly driver: string;
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^att_[0-9a-f]{32}$/;

export function newStorageKey(): string {
  return `att_${randomUUID().replace(/-/g, "")}`;
}

export function isValidStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

function assertKey(key: string): void {
  if (!isValidStorageKey(key)) throw new Error("Недопустимый ключ вложения");
}

export function createLocalDiskStorage(dir: string): AttachmentStorage {
  const root = path.resolve(dir);
  const fileOf = (key: string) => {
    assertKey(key);
    return path.join(root, key);
  };
  return {
    driver: "local",
    async put(key, data) {
      const file = fileOf(key);
      await mkdir(root, { recursive: true });
      await writeFile(file, data, { flag: "wx" });
    },
    async get(key) {
      try {
        return await readFile(fileOf(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      await rm(fileOf(key), { force: true });
    },
  };
}

/** Минимальный контракт Prisma для драйвера «db» — не тянем сюда весь клиент. */
export interface BlobTable {
  attachmentBlob: {
    create(args: { data: { storageKey: string; data: Uint8Array<ArrayBuffer> } }): Promise<unknown>;
    findUnique(args: { where: { storageKey: string } }): Promise<{ data: Uint8Array } | null>;
    deleteMany(args: { where: { storageKey: string } }): Promise<unknown>;
  };
}

export function createDatabaseStorage(db: BlobTable): AttachmentStorage {
  return {
    driver: "db",
    async put(key, data) {
      assertKey(key);
      await db.attachmentBlob.create({ data: { storageKey: key, data: new Uint8Array(data) } });
    },
    async get(key) {
      assertKey(key);
      const row = await db.attachmentBlob.findUnique({ where: { storageKey: key } });
      return row ? Buffer.from(row.data) : null;
    },
    async delete(key) {
      assertKey(key);
      await db.attachmentBlob.deleteMany({ where: { storageKey: key } });
    },
  };
}

export type StorageDriver = "local" | "db";

/** ATTACHMENTS_DRIVER=local|db; по умолчанию db в production и local в разработке. */
export function resolveStorageDriver(env: Record<string, string | undefined> = process.env): StorageDriver {
  const value = env.ATTACHMENTS_DRIVER;
  if (value === "local" || value === "db") return value;
  return env.NODE_ENV === "production" ? "db" : "local";
}

export function attachmentsDir(env: Record<string, string | undefined> = process.env): string {
  return env.ATTACHMENTS_DIR || path.join(process.cwd(), ".data", "attachments");
}
