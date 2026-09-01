import { and, eq, isNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  actorColumns,
  createSession,
  hashPassword,
  needsInitialSetup,
  normalizeEmail,
  sha256,
  validatePassword,
} from "@/lib/auth";
import { ApiError, apiError, requireSameOrigin, writeAudit } from "@/lib/server";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!(await needsInitialSetup())) {
      throw new ApiError(409, "O acesso inicial já foi configurado.");
    }
    const body = (await request.json()) as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    const password = body.password;
    const activationCode =
      typeof body.activationCode === "string" ? body.activationCode.trim() : "";
    if (!validatePassword(password)) {
      throw new ApiError(400, "A senha deve ter de 12 a 128 caracteres, com letra e número.");
    }

    const configuredCode = (
      env as unknown as { INITIAL_SETUP_CODE?: string }
    ).INITIAL_SETUP_CODE;
    if (
      !configuredCode ||
      !activationCode ||
      (await sha256(activationCode)) !== (await sha256(configuredCode))
    ) {
      throw new ApiError(403, "Código de ativação inválido.");
    }

    const db = getDb();
    const [supervisor] = await db
      .select(actorColumns)
      .from(users)
      .where(
        and(
          eq(users.email, email),
          eq(users.role, "supervisor"),
          eq(users.active, true),
          isNull(users.passwordHash),
        ),
      )
      .limit(1);
    if (!supervisor) {
      throw new ApiError(403, "Supervisor inicial não encontrado.");
    }

    const passwordData = await hashPassword(password);
    await db.update(users).set(passwordData).where(eq(users.email, email));
    await writeAudit({
      actor: supervisor,
      action: "alterou",
      entityType: "usuário",
      entityId: email,
      summary: "Configurou o primeiro acesso por senha.",
    });
    const cookie = await createSession(email, request);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
