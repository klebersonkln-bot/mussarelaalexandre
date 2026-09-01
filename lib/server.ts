import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, priceHistory } from "@/db/schema";
import {
  getCurrentActor,
  requireSameOrigin as validateSameOrigin,
  type ActorUser,
} from "@/lib/auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getActor(): Promise<ActorUser> {
  const actor = await getCurrentActor();
  if (!actor) throw new ApiError(401, "Sua sessão expirou. Entre novamente.");
  return actor;
}

export function requireSupervisor(actor: ActorUser) {
  if (actor.role !== "supervisor") {
    throw new ApiError(403, "Esta ação é exclusiva do supervisor.");
  }
}

export function requireDeliveryPermission(actor: ActorUser) {
  if (actor.role !== "supervisor" && !actor.canRecordDeliveries) {
    throw new ApiError(403, "Você não tem permissão para lançar entregas.");
  }
}

export function requirePaymentPermission(actor: ActorUser) {
  if (actor.role !== "supervisor" && !actor.canRecordPayments) {
    throw new ApiError(403, "Você não tem permissão para lançar pagamentos.");
  }
}

export async function getApplicablePrice(date: string) {
  const db = getDb();
  const [price] = await db
    .select()
    .from(priceHistory)
    .where(sql`${priceHistory.effectiveDate} <= ${date}`)
    .orderBy(desc(priceHistory.effectiveDate), desc(priceHistory.createdAt))
    .limit(1);
  if (!price) {
    throw new ApiError(400, "Cadastre um preço com vigência igual ou anterior à data da entrega.");
  }
  return price;
}

export async function writeAudit(input: {
  actor: ActorUser;
  action: "criou" | "alterou" | "excluiu";
  entityType: string;
  entityId: string;
  summary: string;
  details?: unknown;
}) {
  await getDb().insert(auditLog).values({
    id: crypto.randomUUID(),
    actorEmail: input.actor.email,
    actorName: input.actor.displayName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    detailsJson: input.details ? JSON.stringify(input.details) : null,
    createdAt: new Date().toISOString(),
  });
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json(
    { error: "Não foi possível concluir a operação." },
    { status: 500 },
  );
}

export function requireSameOrigin(request: Request) {
  try {
    validateSameOrigin(request);
  } catch {
    throw new ApiError(403, "Origem da solicitação inválida.");
  }
}

export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function asPositiveInteger(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${field} deve ser maior que zero.`);
  }
  return number;
}
