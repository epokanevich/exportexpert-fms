import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Ограничитель перебора паролей (D-09) в PostgreSQL — общий для всех инстансов приложения.
 * Ключи: «ip|email» (5 ошибок за 15 мин) и «ip» (30 ошибок за 15 мин, против перебора по многим email).
 * Владелец учётной записи с другого IP не блокируется: ключ включает IP.
 */
export const LOGIN_LIMITS = {
  perIpEmail: { max: 5, windowMs: 15 * 60_000 },
  perIp: { max: 30, windowMs: 15 * 60_000 },
} as const;

const keys = (ip: string, email: string) => ({ ipEmail: `${ip}|${email}`, ip: `${ip}|*` });

export type LoginCheck = { allowed: true } | { allowed: false; retryAfterSec: number };

export async function checkLoginAllowed(ip: string, email: string, now: Date = new Date()): Promise<LoginCheck> {
  const k = keys(ip, email);
  const rows = await prisma.loginAttempt.findMany({ where: { key: { in: [k.ipEmail, k.ip] }, resetAt: { gt: now } } });
  const blocked = rows.filter((r) => r.count >= (r.key === k.ip ? LOGIN_LIMITS.perIp.max : LOGIN_LIMITS.perIpEmail.max));
  if (blocked.length === 0) return { allowed: true };
  const until = Math.max(...blocked.map((r) => r.resetAt.getTime()));
  return { allowed: false, retryAfterSec: Math.ceil((until - now.getTime()) / 1000) };
}

/** Атомарный upsert со счётом: окно начинается заново, если прошлое истекло. Возвращает счётчик после инкремента. */
async function bump(key: string, windowMs: number, now: Date): Promise<{ count: number; resetAt: Date }> {
  const resetAt = new Date(now.getTime() + windowMs);
  // Колонки — timestamp без пояса (UTC, как пишет Prisma). Параметры явно приводим к UTC:
  // иначе PostgreSQL сдвинет их на TimeZone сервера БД.
  const nowUtc = now.toISOString();
  const resetUtc = resetAt.toISOString();
  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "LoginAttempt" ("key", "count", "resetAt") VALUES (${key}, 1, (${resetUtc}::timestamptz AT TIME ZONE 'UTC'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "LoginAttempt"."resetAt" <= (${nowUtc}::timestamptz AT TIME ZONE 'UTC') THEN 1 ELSE "LoginAttempt"."count" + 1 END,
      "resetAt" = CASE WHEN "LoginAttempt"."resetAt" <= (${nowUtc}::timestamptz AT TIME ZONE 'UTC')
        THEN (${resetUtc}::timestamptz AT TIME ZONE 'UTC') ELSE "LoginAttempt"."resetAt" END
    RETURNING "count", ("resetAt" AT TIME ZONE 'UTC') AS "resetAt"`;
  return rows[0];
}

/**
 * Засчитать попытку входа ДО проверки пароля (review MEDIUM): счёт и проверка — один атомарный оператор на ключ,
 * поэтому пачка одновременных запросов не проскочит лимит. Успешный вход затем снимает свою попытку (clearLoginFailures).
 */
export async function consumeLoginAttempt(ip: string, email: string, now: Date = new Date()): Promise<LoginCheck> {
  const k = keys(ip, email);
  const perIpEmail = await bump(k.ipEmail, LOGIN_LIMITS.perIpEmail.windowMs, now);
  const perIp = await bump(k.ip, LOGIN_LIMITS.perIp.windowMs, now);
  const blocked = [
    perIpEmail.count > LOGIN_LIMITS.perIpEmail.max ? perIpEmail.resetAt : null,
    perIp.count > LOGIN_LIMITS.perIp.max ? perIp.resetAt : null,
  ].filter((d): d is Date => d !== null);
  if (blocked.length === 0) return { allowed: true };
  const until = Math.max(...blocked.map((d) => d.getTime()));
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((until - now.getTime()) / 1000)) };
}

/** Неудачная попытка без проверки лимита (например, если счёт уже засчитан ранее) — оставлено для совместимости тестов. */
export async function registerLoginFailure(ip: string, email: string, now: Date = new Date()): Promise<void> {
  await consumeLoginAttempt(ip, email, now);
  // Уборка истёкших записей, чтобы таблица не росла от перебора случайных email.
  await prisma.loginAttempt.deleteMany({ where: { resetAt: { lt: new Date(now.getTime() - 24 * 3_600_000) } } });
}

/** Успешный вход: счётчик IP+email обнуляется, а эта попытка возвращается в бюджет IP (вход офиса за одним NAT). */
export async function clearLoginFailures(ip: string, email: string): Promise<void> {
  const k = keys(ip, email);
  await prisma.loginAttempt.deleteMany({ where: { key: k.ipEmail } });
  await prisma.loginAttempt.updateMany({ where: { key: k.ip, count: { gt: 0 } }, data: { count: { decrement: 1 } } });
}

/**
 * IP клиента за обратным прокси. Берём адрес, добавленный ближайшим доверенным прокси
 * (TRUSTED_PROXY_HOPS, по умолчанию 1 — балансировщик Render/Vercel): левые элементы X-Forwarded-For клиент может подделать.
 */
export function clientIp(headers: Pick<Headers, "get">, trustedHops: number = Number(process.env.TRUSTED_PROXY_HOPS ?? "1")): string {
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const hops = Number.isInteger(trustedHops) && trustedHops > 0 ? trustedHops : 1;
  return chain[chain.length - hops] ?? chain[0] ?? headers.get("x-real-ip") ?? "unknown";
}
