import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { buildCsp, newNonce } from "@/lib/security-headers";

const PUBLIC_PATHS = ["/login"];
/** Маршрут выхода по отозванной сессии: доступен и с cookie, и без — иначе цикл /login ↔ /. */
const SIGNOUT_PATH = "/auth/signout";

/**
 * Быстрый гард: подпись и срок JWT. Отзыв сессии (tokenVersion) проверяется в getSession() по БД —
 * защищённый layout и каждый экшен уводят на /auth/signout. Здесь же — CSP с nonce на каждый запрос.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === SIGNOUT_PATH) return withCsp(request);

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!session && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, error: "Войдите в систему" }, { status: 401 });
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    const response = NextResponse.redirect(url);
    // Удаляем протухший/невалидный cookie, чтобы не проверять его повторно.
    if (request.cookies.has(SESSION_COOKIE)) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (session && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // API-ответы (вложения, CSV) ставят собственную CSP — например, sandbox для файлов; страничная её не перезаписывает.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  return withCsp(request);
}

function withCsp(request: NextRequest): NextResponse {
  const nonce = newNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");
  const requestHeaders = new Headers(request.headers);
  // Next.js читает nonce из CSP заголовка запроса и проставляет его своим <script>.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
