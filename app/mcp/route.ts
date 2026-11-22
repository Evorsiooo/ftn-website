import { NextRequest } from "next/server";
import { handleMcpPost } from "@/lib/mcp/server";
import { corsHeaders } from "@/lib/mcp/oauth";

export const runtime = "edge";

// The MCP server AI apps connect to: https://ftn.euno.cc/mcp (see lib/mcp/server.ts).
export async function POST(request: NextRequest) {
  try {
    return await handleMcpPost(request);
  } catch (err) {
    console.error("MCP error", err);
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }, { status: 500, headers: corsHeaders });
  }
}

// No server-to-client stream and no sessions (MCP 2026-07-28; optional in earlier versions).
const notAllowed = () => new Response(null, { status: 405, headers: { allow: "POST", ...corsHeaders } });
export const GET = notAllowed;
export const DELETE = notAllowed;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
