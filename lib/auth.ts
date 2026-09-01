import { and, eq, gt, isNotNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";

export type ActorUser = {
  email: string;
  displayName: string;
  role: "supervisor" | "usuario" | "fornecedor";
  canRecordDeliveries: boolean;
  canRecordPayments: boolean;
  active: boolean;
};

export const actorColumns = {
  email: users.email,
  displayName: users.displayName,
  role: users.role,
  canRecordDeliveries: users.canRecordDeliveries,
  canRecordPayments: users.canRecordPayments,
  active: users.active,
};

const SESSION_COOKIE = "mussarela_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
// Cloudflare Workers limits Web Crypto PBKDF2 operations to 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validatePassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 12 &&
    value.length <= 128 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value)
  );
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return {
    passwordHash: toBase64Url(derived),
    passwordSalt: toBase64Url(salt),
    passwordIterations: PASSWORD_ITERATIONS,
    passwordChangedAt: new Date().toISOString(),
  };
}

export async function verifyPassword(
  password: string,
  stored: {
    passwordHash: string | null;
    passwordSalt: string | null;
    passwordIterations: number | null;
  },
) {
  if (!stored.passwordHash || !stored.passwordSalt || !stored.passwordIterations) {
    return false;
  }
  let expected: Uint8Array;
  let salt: Uint8Array;
  try {
    expected = fromBase64Url(stored.passwordHash);
    salt = fromBase64Url(stored.passwordSalt);
  } catch {
    return false;
  }
  const actual = await derivePassword(password, salt, stored.passwordIterations);
  return constantTimeEqual(actual, expected);
}

export async function getCurrentActor(): Promise<ActorUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token || token.length < 32 || token.length > 128) return null;

  const sessionId = await sha256(token);
  const now = new Date().toISOString();
  const [row] = await getDb()
    .select(actorColumns)
    .from(sessions)
    .innerJoin(users, eq(sessions.userEmail, users.email))
    .where(
      and(
        eq(sessions.id, sessionId),
        gt(sessions.expiresAt, now),
        eq(users.active, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function needsInitialSetup() {
  const [supervisor] = await getDb()
    .select({ email: users.email })
    .from(users)
    .where(
      and(
        eq(users.role, "supervisor"),
        eq(users.active, true),
        isNotNull(users.passwordHash),
      ),
    )
    .limit(1);
  return !supervisor;
}

export async function createSession(email: string, request: Request) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toBase64Url(tokenBytes);
  const sessionId = await sha256(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await getDb().insert(sessions).values({
    id: sessionId,
    userEmail: email,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  });
  return sessionCookie(token, request, SESSION_MAX_AGE_SECONDS);
}

export async function destroyCurrentSession(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token && token.length >= 32 && token.length <= 128) {
    await getDb().delete(sessions).where(eq(sessions.id, await sha256(token)));
  }
  return sessionCookie("", request, 0);
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new Error("Origem da solicitação inválida.");
  }
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

function sessionCookie(value: string, request: Request, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
