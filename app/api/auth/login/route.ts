import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { loginAttempts, users } from "@/db/schema";
import {
  createSession,
  normalizeEmail,
  sha256,
  verifyPassword,
} from "@/lib/auth";
import { ApiError, apiError, requireSameOrigin } from "@/lib/server";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const INVALID_LOGIN = "E-mail ou senha inválidos.";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || password.length > 128) {
      throw new ApiError(401, INVALID_LOGIN);
    }

    const clientAddress = request.headers.get("cf-connecting-ip") ?? "unknown";
    const attemptId = await sha256(`${email}|${clientAddress}`);
    const db = getDb();
    const [attempt] = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.id, attemptId))
      .limit(1);
    const now = new Date();
    if (attempt?.lockedUntil && new Date(attempt.lockedUntil) > now) {
      throw new ApiError(429, "Muitas tentativas. Aguarde 15 minutos e tente novamente.");
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const valid = Boolean(
      user?.active && (await verifyPassword(password, user)),
    );
    if (!valid) {
      await registerFailure(attemptId, attempt, now);
      throw new ApiError(401, INVALID_LOGIN);
    }

    await db.delete(loginAttempts).where(eq(loginAttempts.id, attemptId));
    const cookie = await createSession(user.email, request);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

async function registerFailure(
  attemptId: string,
  existing: typeof loginAttempts.$inferSelect | undefined,
  now: Date,
) {
  const windowExpired =
    !existing || now.getTime() - new Date(existing.windowStartedAt).getTime() >= WINDOW_MS;
  const failedCount = windowExpired ? 1 : existing.failedCount + 1;
  const row = {
    id: attemptId,
    failedCount,
    windowStartedAt: windowExpired ? now.toISOString() : existing.windowStartedAt,
    lockedUntil:
      failedCount >= MAX_ATTEMPTS
        ? new Date(now.getTime() + WINDOW_MS).toISOString()
        : null,
  };
  await getDb()
    .insert(loginAttempts)
    .values(row)
    .onConflictDoUpdate({
      target: loginAttempts.id,
      set: {
        failedCount: row.failedCount,
        windowStartedAt: row.windowStartedAt,
        lockedUntil: row.lockedUntil,
      },
    });
}
