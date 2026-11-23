import { NextRequest } from "next/server";
import { authorizationServerMetadata, corsHeaders, siteOrigin } from "@/lib/mcp/oauth";

export const runtime = "edge";

// Served at /.well-known/oauth-authorization-server (rewrite in next.config.ts).
export async function GET(request: NextRequest) {
  return Response.json(authorizationServerMetadata(siteOrigin(request)), {
    headers: { ...corsHeaders, "cache-control": "public, max-age=3600" },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
