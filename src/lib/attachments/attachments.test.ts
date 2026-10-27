import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { contentDisposition, detectMimeType, MAX_ATTACHMENT_BYTES, validateUpload } from "./validation";
import { createLocalDiskStorage, isValidStorageKey, newStorageKey } from "./storage";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n", "latin1");
const HTML = Buffer.from("<html><script>alert(1)</script></html>");

describe("file type is detected by signature, not by extension (2.6)", () => {
  test("PNG, JPEG and PDF are recognised", () => {
    expect(detectMimeType(PNG)).toBe("image/png");
    expect(detectMimeType(JPEG)).toBe("image/jpeg");
    expect(detectMimeType(PDF)).toBe("application/pdf");
  });

  test("an HTML file renamed to .png is rejected", () => {
    expect(detectMimeType(HTML)).toBeNull();
    expect(validateUpload({ name: "eir.png", size: HTML.length }, HTML)).toEqual({ ok: false, error: "Допустимы только PNG, JPEG и PDF (тип определяется по содержимому файла)" });
  });

  test("a PNG named .pdf is stored as PNG", () => {
    expect(validateUpload({ name: "act.pdf", size: PNG.length }, PNG)).toMatchObject({ ok: true, mimeType: "image/png" });
  });

  test("files over 5 MB and empty files are rejected", () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_ATTACHMENT_BYTES)]);
    expect(validateUpload({ name: "big.png", size: big.length }, big)).toMatchObject({ ok: false });
    expect(validateUpload({ name: "e.png", size: 0 }, Buffer.alloc(0))).toMatchObject({ ok: false });
    expect(MAX_ATTACHMENT_BYTES).toBe(5 * 1024 * 1024);
  });

  test("the declared size must match the bytes actually received", () => {
    expect(validateUpload({ name: "x.png", size: 3 }, PNG)).toMatchObject({ ok: false });
  });

  test("the file name is sanitised for storage and download headers", () => {
    const r = validateUpload({ name: "../../etc/Акт осмотра\r\n.png", size: PNG.length }, PNG);
    expect(r).toMatchObject({ ok: true, fileName: "Акт осмотра.png" });
    expect(contentDisposition("Акт №1.pdf", "attachment")).toBe(`attachment; filename="1.pdf"; filename*=UTF-8''%D0%90%D0%BA%D1%82%20%E2%84%961.pdf`);
  });
});

describe("storage abstraction: local disk driver", () => {
  const dirs: string[] = [];
  afterAll(async () => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

  test("put / get / delete round-trip outside the public folder", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "fms-att-"));
    dirs.push(dir);
    const storage = createLocalDiskStorage(dir);
    const key = newStorageKey();
    await storage.put(key, PDF);
    expect(await storage.get(key)).toEqual(PDF);
    expect(await readdir(dir)).toHaveLength(1);
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  test("keys are generated, never taken from user input (no path traversal)", async () => {
    expect(isValidStorageKey(newStorageKey())).toBe(true);
    expect(isValidStorageKey("../../etc/passwd")).toBe(false);
    const storage = createLocalDiskStorage(path.join(tmpdir(), "fms-att-guard"));
    await expect(storage.get("../secret")).rejects.toThrow(/ключ/);
  });
});
