/**
 * JWT-сессия (HS256) в httpOnly-cookie. Модуль не зависит от next/headers,
 * поэтому используется и в proxy.ts, и в серверном коде.
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "fms_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // рабочая смена

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
}

const MIN_SECRET_LENGTH = 32;

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SECRET не задан или короче ${MIN_SECRET_LENGTH} символов. Скопируйте .env.example в .env и задайте секрет.`,
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || typeof payload.email !== "string") return null;
    return {
      userId: payload.userId,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : payload.email,
      role: typeof payload.role === "string" ? payload.role : "MANAGER",
    };
  } catch {
    // Просроченный или подделанный токен — просто нет сессии.
    return null;
  }
}
