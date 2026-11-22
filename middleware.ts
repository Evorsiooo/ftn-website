import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { MAINTENANCE } from "@/components/maintenance-banner";

export const config = {
  // Everything but build assets and the favicon (the maintenance screen covers every page and API).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Full-screen maintenance page. Static HTML: no database, no API, no page code runs.
function maintenancePage(message: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Under maintenance · FTN</title>
<style>html,body{margin:0;height:100%;background:#07080b;color:#f5f6f8;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px 16px;box-sizing:border-box}
.dot{width:14px;height:14px;border-radius:50%;background:#ffbb14;box-shadow:0 0 24px #ffbb14;margin-bottom:24px;animation:p 1.6s ease-in-out infinite}
@keyframes p{50%{opacity:.35}}h1{margin:0 0 12px;font-size:clamp(26px,6vw,44px);letter-spacing:-.02em}p{margin:0;max-width:480px;color:#aab0bc;font-size:16px;line-height:1.5}</style></head>
<body><main><div class="dot"></div><h1>Under maintenance</h1><p>${esc(message)}</p></main></body></html>`;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (MAINTENANCE) {
    const headers = { "Cache-Control": "no-store", "Retry-After": "3600" };
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Under maintenance" }, { status: 503, headers });
    return new NextResponse(maintenancePage(MAINTENANCE), { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  }
  if (!/^\/(api\/)?admin(\/|$)/.test(pathname)) return NextResponse.next();

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

  return NextResponse.next();
}
