import { getDb } from "@/db";
import { users } from "@/db/schema";
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

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireSupervisor(actor);
    const body = (await request.json()) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const role = typeof body.role === "string" ? body.role : "";
    if (!/^\S+@\S+\.\S+$/.test(email) || !displayName || !roles.has(role)) {
      return Response.json({ error: "Nome, e-mail ou perfil inválido." }, { status: 400 });
    }
    if (!validatePassword(body.password)) {
      throw new ApiError(400, "A senha inicial deve ter de 12 a 128 caracteres, com letra e número.");
    }
    const now = new Date().toISOString();
    const passwordData = await hashPassword(body.password);
    const row = {
      email,
      displayName,
      role: role as "supervisor" | "usuario" | "fornecedor",
      canRecordDeliveries: role === "supervisor" ? true : body.canRecordDeliveries !== false,
      canRecordPayments: role === "supervisor" ? true : body.canRecordPayments !== false,
      active: true,
      ...passwordData,
      createdBy: actor.email,
      createdAt: now,
      updatedAt: now,
    };
    await getDb().insert(users).values(row);
    await writeAudit({
      actor,
      action: "criou",
      entityType: "usuário",
      entityId: email,
      summary: `Cadastrou ${displayName} como ${role}.`,
      details: {
        email,
        displayName,
        role,
        canRecordDeliveries: row.canRecordDeliveries,
        canRecordPayments: row.canRecordPayments,
        active: true,
      },
    });
    return Response.json(
      {
        user: {
          email,
          displayName,
          role,
          canRecordDeliveries: row.canRecordDeliveries,
          canRecordPayments: row.canRecordPayments,
          active: true,
          createdAt: now,
          hasPassword: true,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
