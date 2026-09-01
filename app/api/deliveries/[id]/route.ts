import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { deliveries } from "@/db/schema";
import { ApiError, apiError, getActor, requireSameOrigin, requireSupervisor, writeAudit } from "@/lib/server";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await getActor();
    requireSupervisor(actor);
    const { id } = await context.params;
    const db = getDb();
    const [existing] = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
    if (!existing) throw new ApiError(404, "Entrega não encontrada.");
    await db.delete(deliveries).where(eq(deliveries.id, id));
    await writeAudit({
      actor,
      action: "excluiu",
      entityType: "entrega",
      entityId: id,
      summary: `Excluiu entrega de ${(existing.totalWeightGrams / 1000).toFixed(3)} kg do dia ${existing.deliveryDate}.`,
      details: existing,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
