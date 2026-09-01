import { getDb } from "@/db";
import { payments } from "@/db/schema";
import {
  apiError,
  asPositiveInteger,
  getActor,
  requirePaymentPermission,
  requireSameOrigin,
  validDate,
  writeAudit,
} from "@/lib/server";

const methods = new Set(["pix", "cheque", "consumo", "compensacao", "outro"]);

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requirePaymentPermission(actor);
    const body = (await request.json()) as Record<string, unknown>;
    if (!validDate(body.paymentDate)) {
      return Response.json({ error: "Data do pagamento inválida." }, { status: 400 });
    }
    if (typeof body.method !== "string" || !methods.has(body.method)) {
      return Response.json({ error: "Forma de pagamento inválida." }, { status: 400 });
    }
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!description) {
      return Response.json({ error: "Informe a descrição do pagamento." }, { status: 400 });
    }
    const amountCents = asPositiveInteger(body.amountCents, "O valor");
    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      paymentDate: body.paymentDate,
      method: body.method as "pix" | "cheque" | "consumo" | "compensacao" | "outro",
      description,
      amountCents,
      createdBy: actor.email,
      createdAt: now,
      updatedAt: now,
    };
    await getDb().insert(payments).values(row);
    await writeAudit({
      actor,
      action: "criou",
      entityType: "pagamento",
      entityId: row.id,
      summary: `Lançou ${description}: R$ ${(amountCents / 100).toFixed(2)} em ${row.paymentDate}.`,
      details: row,
    });
    return Response.json({ payment: row }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
