import { getCurrentActor, needsInitialSetup } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getCurrentActor();
  return Response.json(
    {
      authenticated: Boolean(actor),
      setupRequired: actor ? false : await needsInitialSetup(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
