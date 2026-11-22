import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { getDb } from "@/db";
import { writeAudit } from "@/lib/audit";

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/api/admin",
    "/api/admin/:path*",
    // not gated, only audited when staff change something (see AUDITED)
    "/api/articles/:path*",
    "/api/articles",
    "/api/sports/:path*",
    "/api/upload",
    "/api/radio/config",
    "/api/sync/youtube",
  ],
};

// Staff actions on the website go in the audit log ("POST /api/admin/ads" by adrien). The request
// is logged as sent: whether it then succeeded isn't known here. AI actions are logged by the MCP
// server instead (they never pass through here). Left out: the live Studio (several calls a second
// while on air), chunked video uploads, readers' comments, and the AI page that logs itself.
const NOT_AUDITED = [/^\/api\/admin\/radio\/studio/, /^\/api\/admin\/posts\/media/, /^\/api\/articles\/[^/]+\/comments/, /^\/api\/admin\/ai(\/|$)/];

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  const gated = pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/api/admin" || pathname.startsWith("/api/admin/");
  const changes = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (!gated && !changes) return NextResponse.next();

  const token =
    request.cookies.get("ftn_session")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (!gated) {
    // Public routes that staff also write to: audit only, never block.
    const user = token ? await verifySessionToken(token) : null;
    if (user && user.roles?.length) audit(event, request, user);
    return NextResponse.next();
  }

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

  if (changes && pathname.startsWith("/api/")) audit(event, request, user);
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
