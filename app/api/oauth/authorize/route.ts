import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { oauthCodes } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import {
  CODE_SECONDS,
  MCP_SCOPE,
  canUseAi,
  getClient,
  mcpResource,
  randomToken,
  redirectMatches,
  sha256Hex,
  signAuthRequest,
  siteOrigin,
  verifyAuthRequest,
} from "@/lib/mcp/oauth";

export const runtime = "edge";

function errorPage(request: NextRequest, message: string) {
  const url = new URL("/oauth/consent", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

function backToApp(redirectUri: string, origin: string, params: Record<string, string | null>) {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, v);
  url.searchParams.set("iss", origin); // RFC 9207: lets the app check who answered
  return NextResponse.redirect(url.toString(), 303);
}

// Step 1: an AI app sends the person here. We check the request, then show the Allow page.
export async function GET(request: NextRequest) {
  const origin = siteOrigin(request);
  const q = request.nextUrl.searchParams;
  const clientId = q.get("client_id") || "";
  const redirectUri = q.get("redirect_uri") || "";
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return errorPage(request, "The site's database is unavailable. Try again in a minute.");
  const db = getDb(d1);

  const client = await getClient(db, clientId);
  if (!client) return errorPage(request, "This AI app isn't registered with FTN. Remove the connector in the app and add it again.");
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) {
    return errorPage(request, "This AI app sent a sign-in return address it didn't register.");
  }

  const state = q.get("state");
  const fail = (error: string, description: string) => backToApp(redirectUri, origin, { error, error_description: description, state });
  if (q.get("response_type") !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  const challenge = q.get("code_challenge") || "";
  if (!challenge || q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
    return fail("invalid_request", "PKCE with S256 is required.");
  }
  const resource = q.get("resource") || mcpResource(origin);
  if (resource !== mcpResource(origin) && resource !== origin && resource !== `${origin}/`) {
    return fail("invalid_target", "This server only issues tokens for its MCP server.");
  }
  // There is one permission ("admin"); other requested scopes (offline_access, openid...) are ignored.

  const r = await signAuthRequest({
    clientId: client.id,
    clientName: client.name,
    redirectUri,
    state,
    codeChallenge: challenge,
    scope: MCP_SCOPE,
    resource: mcpResource(origin),
  });
  return NextResponse.redirect(new URL(`/oauth/consent?r=${r}`, request.url), 303);
}

// Step 2: the person clicked Allow or Cancel on the Allow page.
export async function POST(request: NextRequest) {
  const origin = siteOrigin(request);
  // The form only works from this site's own page (the session cookie is SameSite=Lax too).
  const from = request.headers.get("origin");
  if (from && from !== origin) return new NextResponse("Forbidden", { status: 403 });

  const form = await request.formData().catch(() => null);
  const req = await verifyAuthRequest(String(form?.get("r") || ""));
  if (!req) return errorPage(request, "This sign-in link has expired. Start again from the AI app.");
  if (form?.get("decision") !== "allow") {
    return backToApp(req.redirectUri, origin, { error: "access_denied", error_description: "The person cancelled.", state: req.state });
  }

  const token = request.cookies.get("ftn_session")?.value;
  const user = token ? await verifySessionToken(token) : null;
  if (!user) return NextResponse.redirect(new URL(`/oauth/consent?r=${String(form.get("r"))}`, request.url), 303);
  if (!canUseAi(user.roles)) {
    return backToApp(req.redirectUri, origin, { error: "access_denied", error_description: "Only Site Administrators can connect an AI.", state: req.state });
  }

  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return errorPage(request, "The site's database is unavailable. Try again in a minute.");
  const db = getDb(d1);
  const code = randomToken("ftn_code_");
  await db.insert(oauthCodes).values({
    codeHash: await sha256Hex(code),
    clientId: req.clientId,
    userId: user.id,
    redirectUri: req.redirectUri,
    codeChallenge: req.codeChallenge,
    resource: req.resource,
    scope: req.scope,
    expiresAt: new Date(Date.now() + CODE_SECONDS * 1000),
  });
  return backToApp(req.redirectUri, origin, { code, state: req.state });
}
