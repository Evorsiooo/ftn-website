import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { FORCE_MAINTENANCE, MAINTENANCE_MESSAGE, databaseDown } from "@/lib/maintenance";

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (FORCE_MAINTENANCE || (await databaseDown())) {
    const headers = { "Cache-Control": "no-store", "Retry-After": "3600" };
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Under maintenance" }, { status: 503, headers });
    return new NextResponse(maintenancePage(MAINTENANCE_MESSAGE), { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
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
