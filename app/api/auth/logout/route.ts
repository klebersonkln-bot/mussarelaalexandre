import { destroyCurrentSession } from "@/lib/auth";
import { apiError, requireSameOrigin } from "@/lib/server";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const cookie = await destroyCurrentSession(request);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
