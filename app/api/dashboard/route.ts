import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLog,
  deliveries,
  deliveryItems,
  payments,
  priceHistory,
  users,
} from "@/db/schema";
import { apiError, getActor } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getActor();
    const db = getDb();
    const [deliveryRows, paymentRows, prices, userRows, auditRows] =
      await Promise.all([
        db.select().from(deliveries).orderBy(desc(deliveries.deliveryDate), desc(deliveries.createdAt)),
        db.select().from(payments).orderBy(desc(payments.paymentDate), desc(payments.createdAt)),
        db.select().from(priceHistory).orderBy(desc(priceHistory.effectiveDate), desc(priceHistory.createdAt)),
        actor.role === "supervisor"
          ? db
              .select({
                email: users.email,
                displayName: users.displayName,
                role: users.role,
                canRecordDeliveries: users.canRecordDeliveries,
                canRecordPayments: users.canRecordPayments,
                active: users.active,
                createdAt: users.createdAt,
                hasPassword: sql<number>`case when ${users.passwordHash} is not null then 1 else 0 end`,
              })
              .from(users)
              .orderBy(users.displayName)
          : Promise.resolve([]),
        actor.role === "supervisor"
          ? db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(100)
          : Promise.resolve([]),
      ]);

    const items = deliveryRows.length
      ? await db
          .select()
          .from(deliveryItems)
          .orderBy(deliveryItems.deliveryId, deliveryItems.position)
      : [];
    const groupedItems = new Map<string, number[]>();
    for (const item of items) {
      const list = groupedItems.get(item.deliveryId) ?? [];
      list.push(item.weightGrams);
      groupedItems.set(item.deliveryId, list);
    }

    const totalDeliveriesCents = deliveryRows.reduce((sum, row) => sum + row.totalCents, 0);
    const totalPaymentsCents = paymentRows.reduce((sum, row) => sum + row.amountCents, 0);
    const totalWeightGrams = deliveryRows.reduce((sum, row) => sum + row.totalWeightGrams, 0);

    return Response.json({
      actor,
      summary: {
        totalDeliveriesCents,
        totalPaymentsCents,
        totalWeightGrams,
        balanceCents: totalDeliveriesCents - totalPaymentsCents,
      },
      deliveries: deliveryRows.map((row) => ({
        ...row,
        weightsGrams: groupedItems.get(row.id) ?? [],
      })),
      payments: paymentRows,
      prices,
      users: userRows.map((row) => ({ ...row, hasPassword: Boolean(row.hasPassword) })),
      audit: auditRows,
    });
  } catch (error) {
    return apiError(error);
  }
}
