import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin", "/api/admin/:path*"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
