import { getDb } from "@/db";
import { priceHistory } from "@/db/schema";
import {
  apiError,
  asPositiveInteger,
  getActor,
  requireSameOrigin,
  requireSupervisor,
  validDate,
  writeAudit,
} from "@/lib/server";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireSupervisor(actor);
    const body = (await request.json()) as Record<string, unknown>;
    if (!validDate(body.effectiveDate)) {
      return Response.json({ error: "Data de vigência inválida." }, { status: 400 });
    }
    const priceCents = asPositiveInteger(body.priceCents, "O preço");
    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      effectiveDate: body.effectiveDate,
      priceCents,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      createdBy: actor.email,
      createdAt: now,
      updatedAt: now,
    };
    await getDb().insert(priceHistory).values(row);
    await writeAudit({
      actor,
      action: "criou",
      entityType: "preço",
      entityId: row.id,
      summary: `Cadastrou preço de R$ ${(priceCents / 100).toFixed(2)} com vigência em ${row.effectiveDate}.`,
      details: row,
    });
    return Response.json({ price: row }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
