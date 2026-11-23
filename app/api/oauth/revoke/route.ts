import { NextRequest } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { oauthGrants } from "@/db/schema";
import { authenticateClient, corsHeaders, sha256Hex } from "@/lib/mcp/oauth";

export const runtime = "edge";

// RFC 7009: an AI app disconnecting (Gemini calls this when the person unlinks it).
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return new Response(null, { status: 500, headers: corsHeaders });
  const db = getDb(d1);
  const auth = await authenticateClient(db, request, form);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status, headers: corsHeaders });
  const hash = await sha256Hex(form.get("token") || "");
  await db
    .update(oauthGrants)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthGrants.clientId, auth.client.id), or(eq(oauthGrants.accessHash, hash), eq(oauthGrants.refreshHash, hash))));
  // Always 200, whether or not the token existed (RFC 7009 2.2).
  return new Response(null, { status: 200, headers: corsHeaders });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
