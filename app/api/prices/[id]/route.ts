import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { priceHistory } from "@/db/schema";
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
    const [existing] = await db.select().from(priceHistory).where(eq(priceHistory.id, id)).limit(1);
    if (!existing) throw new ApiError(404, "Preço não encontrado.");
    await db.delete(priceHistory).where(eq(priceHistory.id, id));
    await writeAudit({ actor, action: "excluiu", entityType: "preço", entityId: id, summary: `Excluiu preço de R$ ${(existing.priceCents / 100).toFixed(2)} com vigência em ${existing.effectiveDate}.`, details: existing });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
