import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashPassword, validatePassword } from "@/lib/auth";
import {
  ApiError,
  apiError,
  getActor,
  requireSameOrigin,
  requireSupervisor,
  writeAudit,
} from "@/lib/server";

const roles = new Set(["supervisor", "usuario", "fornecedor"]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ email: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireSupervisor(actor);
    const { email: rawEmail } = await context.params;
    const email = decodeURIComponent(rawEmail).toLowerCase();
    const body = (await request.json()) as Record<string, unknown>;
    const db = getDb();
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!existing) throw new ApiError(404, "Usuário não encontrado.");

    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const role = typeof body.role === "string" ? body.role : "";
    if (!displayName || !roles.has(role)) throw new ApiError(400, "Nome ou perfil inválido.");
    const active = body.active !== false;
    if (email === actor.email && (role !== "supervisor" || !active)) {
      throw new ApiError(400, "O supervisor conectado não pode remover o próprio acesso.");
    }

    const newPassword =
      typeof body.password === "string" && body.password.length > 0
        ? body.password
        : null;
    if (newPassword && !validatePassword(newPassword)) {
      throw new ApiError(400, "A nova senha deve ter de 12 a 128 caracteres, com letra e número.");
    }
    if (newPassword && email === actor.email) {
      throw new ApiError(400, "Use a opção Alterar minha senha para modificar o próprio acesso.");
    }

    const updated = {
      displayName,
      role: role as "supervisor" | "usuario" | "fornecedor",
      canRecordDeliveries: role === "supervisor" ? true : body.canRecordDeliveries === true,
      canRecordPayments: role === "supervisor" ? true : body.canRecordPayments === true,
      active,
      updatedAt: new Date().toISOString(),
    };
    const passwordData = newPassword ? await hashPassword(newPassword) : {};
    await db
      .update(users)
      .set({ ...updated, ...passwordData })
      .where(eq(users.email, email));
    if (newPassword || !active) {
      await db.delete(sessions).where(eq(sessions.userEmail, email));
    }
    await writeAudit({
      actor,
      action: "alterou",
      entityType: "usuário",
      entityId: email,
      summary: `Alterou o acesso de ${displayName}: perfil ${role}, entregas ${updated.canRecordDeliveries ? "permitidas" : "somente consulta"}, pagamentos ${updated.canRecordPayments ? "permitidos" : "somente consulta"} e usuário ${updated.active ? "ativo" : "inativo"}.`,
      details: {
        before: {
          displayName: existing.displayName,
          role: existing.role,
          canRecordDeliveries: existing.canRecordDeliveries,
          canRecordPayments: existing.canRecordPayments,
          active: existing.active,
        },
        after: updated,
        passwordReset: Boolean(newPassword),
      },
    });
    return Response.json({
      user: {
        email,
        ...updated,
        createdAt: existing.createdAt,
        hasPassword: Boolean(newPassword || existing.passwordHash),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ email: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireSupervisor(actor);
    const { email: rawEmail } = await context.params;
    const email = decodeURIComponent(rawEmail).toLowerCase();

    if (email === actor.email) {
      throw new ApiError(400, "O supervisor conectado não pode excluir a própria conta.");
    }

    const db = getDb();
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!existing) throw new ApiError(404, "Usuário não encontrado.");

    await db.delete(sessions).where(eq(sessions.userEmail, email));
    await db.delete(users).where(eq(users.email, email));
    await writeAudit({
      actor,
      action: "excluiu",
      entityType: "usuário",
      entityId: email,
      summary: `Excluiu o usuário ${existing.displayName} (${email}).`,
      details: {
        displayName: existing.displayName,
        role: existing.role,
        canRecordDeliveries: existing.canRecordDeliveries,
        canRecordPayments: existing.canRecordPayments,
        active: existing.active,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
