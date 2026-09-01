import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
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
    const [existing] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
    if (!existing) throw new ApiError(404, "Pagamento não encontrado.");
    await db.delete(payments).where(eq(payments.id, id));
    await writeAudit({ actor, action: "excluiu", entityType: "pagamento", entityId: id, summary: `Excluiu ${existing.description}, no valor de R$ ${(existing.amountCents / 100).toFixed(2)}.`, details: existing });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
