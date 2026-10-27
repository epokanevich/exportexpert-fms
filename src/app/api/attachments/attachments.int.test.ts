import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/dal", async () => {
  const { currentSession } = await import("../../../../test/session-mock");
  return { getSession: vi.fn(async () => (currentSession.userId ? currentSession : null)), requireSession: vi.fn(async () => currentSession) };
});

import { prisma } from "@/lib/prisma";
import { POST } from "./route";
import { GET } from "./[id]/route";
import { createContainer, createUser, resetDomain } from "../../../../test/fixtures";
import { actAsUser, currentSession } from "../../../../test/session-mock";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

async function eventId(): Promise<string> {
  const c = await createContainer(prisma);
  const e = await prisma.containerEvent.create({ data: { containerId: c.id, type: "INSPECTION", occurredAt: new Date(), description: "Акт осмотра" } });
  return e.id;
}

function upload(id: string, bytes: Uint8Array, name = "eir.png", type = "image/png"): Request {
  const form = new FormData();
  form.set("eventId", id);
  form.set("file", new File([new Uint8Array(bytes)], name, { type }));
  return new Request("http://fms.local/api/attachments", { method: "POST", body: form });
}

beforeEach(async () => {
  await resetDomain(prisma);
  actAsUser(await createUser(prisma, "INSPECTOR"));
});
afterAll(() => prisma.$disconnect());

describe.each(["db", "local"])("attachments API, storage driver %s (2.6)", (driver) => {
  beforeEach(() => {
    vi.stubEnv("ATTACHMENTS_DRIVER", driver);
    vi.resetModules();
  });

  test("an inspector uploads an EIR photo; it is served back only with a session", async () => {
    const { POST: post } = await import("./route");
    const { GET: get } = await import("./[id]/route");
    const id = await eventId();
    const res = await post(upload(id, PNG));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: body.id } });
    expect(row).toMatchObject({ mimeType: "image/png", sizeBytes: PNG.length, fileName: "eir.png" });

    const download = await get(new Request("http://fms.local"), { params: Promise.resolve({ id: body.id }) });
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("image/png");
    expect(download.headers.get("content-security-policy")).toContain("sandbox");
    expect(Buffer.from(await download.arrayBuffer())).toEqual(PNG);

    Object.assign(currentSession, { userId: "" });
    const anonymous = await get(new Request("http://fms.local"), { params: Promise.resolve({ id: body.id }) });
    expect(anonymous.status).toBe(401);
  });
});

describe("attachments API: rejections", () => {
  test("HTML disguised as .png is rejected by signature", async () => {
    const res = await POST(upload(await eventId(), Buffer.from("<html><script>alert(1)</script>"), "eir.png"));
    expect(res.status).toBe(422);
    expect(await prisma.attachment.count()).toBe(0);
  });

  test("a body over 5 MB is refused before reading", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    PNG.copy(big);
    const res = await POST(upload(await eventId(), big));
    expect(res.status).toBe(413);
  });

  test("no session → 401, nothing stored", async () => {
    const id = await eventId();
    Object.assign(currentSession, { userId: "" });
    const res = await POST(upload(id, PNG));
    expect(res.status).toBe(401);
    expect(await prisma.attachment.count()).toBe(0);
  });

  test("unknown event → 404", async () => {
    await eventId();
    const res = await POST(upload("no-such-event", PNG));
    expect(res.status).toBe(404);
  });
});
