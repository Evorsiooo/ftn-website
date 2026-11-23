import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { oauthClients } from "@/db/schema";
import { corsHeaders, friendlyAiName, isAllowedRedirect, randomToken, sha256Hex, tokenJson } from "@/lib/mcp/oauth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "edge";

// Dynamic client registration (RFC 7591): Claude, ChatGPT and Gemini register themselves here.
// Only the return addresses of supported AI apps are accepted (see isAllowedRedirect).
export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(`oauth-register:${getClientIp(request)}`, 20, 3600);
  if (!limit.allowed) return tokenJson({ error: "slow_down", error_description: "Too many registrations." }, 429);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return tokenJson({ error: "invalid_client_metadata", error_description: "Send JSON." }, 400);
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (uris.length === 0 || uris.length > 20) {
    return tokenJson({ error: "invalid_redirect_uri", error_description: "redirect_uris is required." }, 400);
  }
  const bad = uris.find((u) => !isAllowedRedirect(u));
  if (bad) {
    return tokenJson({ error: "invalid_redirect_uri", error_description: `This site only accepts Claude, ChatGPT and Gemini (not ${bad}).` }, 400);
  }
  const grantTypes = Array.isArray(body.grant_types) ? body.grant_types : ["authorization_code", "refresh_token"];
  if (grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    return tokenJson({ error: "invalid_client_metadata", error_description: "Only authorization_code and refresh_token are supported." }, 400);
  }
  const responseTypes = Array.isArray(body.response_types) ? body.response_types : ["code"];
  if (responseTypes.some((r) => r !== "code")) {
    return tokenJson({ error: "invalid_client_metadata", error_description: "Only the code response type is supported." }, 400);
  }
  const method = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) {
    return tokenJson({ error: "invalid_client_metadata", error_description: "Unsupported token_endpoint_auth_method." }, 400);
  }

  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return tokenJson({ error: "server_error" }, 500);
  const db = getDb(d1);

  const clientId = randomToken("ftn_client_");
  const secret = method === "none" ? null : randomToken("ftn_secret_");
  const rawName = typeof body.client_name === "string" ? body.client_name : "";
  const name = friendlyAiName(rawName, uris[0]);
  const now = new Date();
  await db.insert(oauthClients).values({
    id: clientId,
    name,
    redirectUris: JSON.stringify(uris),
    secretHash: secret ? await sha256Hex(secret) : null,
    kind: "dcr",
    createdAt: now,
  });

  return tokenJson(
    {
      client_id: clientId,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(now.getTime() / 1000),
      client_name: rawName || name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: method,
      scope: "admin",
    },
    201
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
