import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { FORCE_MAINTENANCE, MAINTENANCE_MESSAGE, databaseState } from "@/lib/maintenance";
import { getDb } from "@/db";
import { writeAudit } from "@/lib/audit";

export const config = {
  // Everything but build assets, logos, fonts and the favicon (the maintenance page covers every page and API).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logos/|fonts/).*)"],
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Full-screen maintenance page. Static HTML: no database, no API, no page code runs.
function maintenancePage(message: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Under maintenance · FTN</title><link rel="icon" href="/logos/ftn_favicon_transparent.png">
<style>@font-face{font-family:Geist;src:url(/fonts/geist.woff2) format("woff2");font-weight:100 900;font-display:swap}
html,body{margin:0;height:100%;background:#07080b;color:#f5f6f8;font-family:Geist,ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px 16px;box-sizing:border-box}
img{height:40px;width:auto;margin-bottom:32px}h1{margin:0 0 8px;font-size:28px;font-weight:600;letter-spacing:-.01em}p{margin:0;max-width:440px;color:#aab0bc;font-size:16px;line-height:1.5}</style></head>
<body><main><img src="/logos/ftn_textwhite_transparent.png" alt="FTN"><h1>Under maintenance</h1><p>${esc(message)}</p></main></body></html>`;
}

// Public routes staff also write to: audited when staff change something, never gated.
const AUDITED_PUBLIC = [/^\/api\/articles(\/|$)/, /^\/api\/sports\//, /^\/api\/upload$/, /^\/api\/radio\/config$/, /^\/api\/sync\/youtube$/];

// Staff actions on the website go in the audit log ("POST /api/admin/ads" by adrien). The request
// is logged as sent: whether it then succeeded isn't known here. AI actions are logged by the MCP
// server instead (they never pass through here). Left out: the live Studio (several calls a second
// while on air), chunked video uploads, readers' comments, and the AI page that logs itself.
const NOT_AUDITED = [/^\/api\/admin\/radio\/studio/, /^\/api\/admin\/posts\/media/, /^\/api\/articles\/[^/]+\/comments/, /^\/api\/admin\/ai(\/|$)/];

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  // x-ftn-db says what the health probe saw (up, down or unknown), to check it from outside.
  const db = FORCE_MAINTENANCE ? "forced" : await databaseState();
  if (db === "forced" || db === "down") {
    const headers = { "Cache-Control": "no-store", "Retry-After": "3600", "x-ftn-db": db };
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Under maintenance" }, { status: 503, headers });
    return new NextResponse(maintenancePage(MAINTENANCE_MESSAGE), { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  }
  if (!/^\/(api\/)?admin(\/|$)/.test(pathname)) {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && AUDITED_PUBLIC.some((re) => re.test(pathname))) {
      // audit only, never block
      const token = request.cookies.get("ftn_session")?.value || request.headers.get("authorization")?.replace("Bearer ", "");
      const user = token ? await verifySessionToken(token) : null;
      if (user && user.roles?.length) audit(event, request, user);
    }
    const res = NextResponse.next();
    res.headers.set("x-ftn-db", db);
    return res;
  }

  const token =
    request.cookies.get("ftn_session")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  // If no session cookie/token exists
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized: Authentication required" }, { status: 401 });
    }
    // Redirect unauthenticated visitors to home page immediately
    const loginUrl = new URL("/?error=staff_authentication_required", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Verify JWT signature and staff role permissions
  const user = await verifySessionToken(token);
  if (!user || !user.roles || user.roles.length === 0) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Forbidden: Staff permissions required to access administration" },
        { status: 403 }
      );
    }
    const forbiddenUrl = new URL("/?error=insufficient_permissions", request.url);
    return NextResponse.redirect(forbiddenUrl);
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && pathname.startsWith("/api/")) audit(event, request, user);
  return NextResponse.next();
}

function audit(event: NextFetchEvent, request: NextRequest, user: { id: string; robloxUsername: string }) {
  const { pathname } = request.nextUrl;
  if (NOT_AUDITED.some((re) => re.test(pathname))) return;
  const d1 = (process.env as any).DB as D1Database | undefined;
  if (!d1) return;
  const action = `${request.method} ${pathname}`;
  const id = request.nextUrl.searchParams.get("id");
  event.waitUntil(
    writeAudit(getDb(d1), {
      userId: user.id,
      actorLabel: user.robloxUsername,
      via: "web",
      action,
      summary: id ? `${action} (id ${id})` : action,
      status: "sent",
    })
  );
}
