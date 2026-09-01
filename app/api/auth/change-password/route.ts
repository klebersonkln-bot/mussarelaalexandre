import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import {
  createSession,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "@/lib/auth";
import { ApiError, apiError, getActor, requireSameOrigin, writeAudit } from "@/lib/server";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    const body = (await request.json()) as Record<string, unknown>;
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = body.newPassword;
    if (!validatePassword(newPassword)) {
      throw new ApiError(400, "A nova senha deve ter de 12 a 128 caracteres, com letra e número.");
    }
    if (currentPassword === newPassword) {
      throw new ApiError(400, "A nova senha deve ser diferente da senha atual.");
    }

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, actor.email)).limit(1);
    if (!user || !(await verifyPassword(currentPassword, user))) {
      throw new ApiError(401, "Senha atual incorreta.");
    }

    await db.update(users).set(await hashPassword(newPassword)).where(eq(users.email, actor.email));
    await db.delete(sessions).where(eq(sessions.userEmail, actor.email));
    await writeAudit({
      actor,
      action: "alterou",
      entityType: "usuário",
      entityId: actor.email,
      summary: "Alterou a própria senha.",
    });
    const cookie = await createSession(actor.email, request);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
