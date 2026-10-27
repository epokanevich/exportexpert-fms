import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

/** Сессия отозвана или истекла: удаляем cookie и ведём на вход. Отдельный маршрут — иначе proxy вернёт с /login на «/». */
export function GET(request: NextRequest): NextResponse {
  const url = new URL("/login", request.url);
  url.searchParams.set("reason", "session");
  const response = NextResponse.redirect(url);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
