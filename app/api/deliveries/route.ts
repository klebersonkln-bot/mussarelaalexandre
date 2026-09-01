import { getDb } from "@/db";
import { deliveries, deliveryItems } from "@/db/schema";
import {
  apiError,
  asPositiveInteger,
  getActor,
  getApplicablePrice,
  requireDeliveryPermission,
  requireSameOrigin,
  validDate,
  writeAudit,
} from "@/lib/server";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireDeliveryPermission(actor);
    const body = (await request.json()) as Record<string, unknown>;
    if (!validDate(body.deliveryDate)) {
      return Response.json({ error: "Data da entrega inválida." }, { status: 400 });
    }
    if (!Array.isArray(body.weightsGrams) || body.weightsGrams.length === 0) {
      return Response.json({ error: "Informe pelo menos um peso." }, { status: 400 });
    }
    const weights = body.weightsGrams.map((value) => asPositiveInteger(value, "Cada peso"));
    const totalWeightGrams = weights.reduce((sum, value) => sum + value, 0);
    const price = await getApplicablePrice(body.deliveryDate);
    const totalCents = Math.round((totalWeightGrams * price.priceCents) / 1000);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const row = {
      id,
      deliveryDate: body.deliveryDate,
      totalWeightGrams,
      pricePerKgCents: price.priceCents,
      totalCents,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      createdBy: actor.email,
      createdAt: now,
      updatedAt: now,
    };
    const db = getDb();
    await db.batch([
      db.insert(deliveries).values(row),
      db.insert(deliveryItems).values(
        weights.map((weightGrams, position) => ({
          id: crypto.randomUUID(),
          deliveryId: id,
          weightGrams,
          position,
        })),
      ),
    ]);
    await writeAudit({
      actor,
      action: "criou",
      entityType: "entrega",
      entityId: id,
      summary: `Lançou ${(totalWeightGrams / 1000).toFixed(3)} kg em ${row.deliveryDate}.`,
      details: { ...row, weightsGrams: weights },
    });
    return Response.json({ delivery: { ...row, weightsGrams: weights } }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
