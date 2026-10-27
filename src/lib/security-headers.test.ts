import { describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { buildCsp, newNonce, staticSecurityHeaders } from "./security-headers";
import { clientIp } from "./auth/rate-limit";

describe("CSP (D-25)", () => {
  test("production: scripts only by nonce, no unsafe-inline / unsafe-eval, framing denied", () => {
    const csp = buildCsp("abc123", false);
    const script = csp.split("; ").find((d) => d.startsWith("script-src"));
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toContain("unsafe-eval");
  });

  test("dev adds unsafe-eval only for React dev tooling", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
  });

  test("nonce is random base64", () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a).not.toBe(newNonce());
  });

  test("HSTS only in production", () => {
    expect(staticSecurityHeaders(true).map((h) => h.key)).toContain("Strict-Transport-Security");
    expect(staticSecurityHeaders(false).map((h) => h.key)).not.toContain("Strict-Transport-Security");
    expect(staticSecurityHeaders(true)).toEqual(expect.arrayContaining([{ key: "X-Content-Type-Options", value: "nosniff" }]));
  });
});

describe("clientIp behind a proxy", () => {
  const h = (xff: string | null, real: string | null = null) => ({ get: (k: string) => (k === "x-forwarded-for" ? xff : k === "x-real-ip" ? real : null) });
  test("takes the address appended by the trusted proxy, not a spoofed left-most value", () => {
    expect(clientIp(h("1.1.1.1, 203.0.113.7"), 1)).toBe("203.0.113.7");
    expect(clientIp(h("1.1.1.1, 203.0.113.7, 10.0.0.2"), 2)).toBe("203.0.113.7");
  });
  test("falls back to x-real-ip and then 'unknown'", () => {
    expect(clientIp(h(null, "198.51.100.4"), 1)).toBe("198.51.100.4");
    expect(clientIp(h(null), 1)).toBe("unknown");
  });
});
