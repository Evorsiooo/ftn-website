import { NextRequest } from "next/server";
import { corsHeaders, protectedResourceMetadata, siteOrigin } from "@/lib/mcp/oauth";

export const runtime = "edge";

// Served at /.well-known/oauth-protected-resource and /.well-known/oauth-protected-resource/mcp
// (rewrites in next.config.ts): tells AI apps that /mcp signs in through this site.
export async function GET(request: NextRequest) {
  return Response.json(protectedResourceMetadata(siteOrigin(request)), {
    headers: { ...corsHeaders, "cache-control": "public, max-age=3600" },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
