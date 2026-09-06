import { NextRequest, NextResponse } from "next/server";
import { getRobloxAuthUrl } from "@/lib/auth";
import { getDb } from "@/db";
import { siteSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const forceEmergency = searchParams.get("force") === "true";

  // Check authMode in siteSettings
  if (!forceEmergency) {
    try {
      const d1 = (process.env as any).DB as D1Database;
      if (d1) {
        const db = getDb(d1);
        const row = await db
          .select()
          .from(siteSettings)
          .where(eq(siteSettings.key, "general"))
          .limit(1);

        if (row.length > 0) {
          const general = JSON.parse(row[0].valueJson);
          if (general.authMode === "credentials") {
            return NextResponse.redirect(new URL("/auth/signin", request.url));
          }
        }
      }
    } catch {}
  }

  const clientId = process.env.ROBLOX_CLIENT_ID;
  const origin = new URL(request.url).origin;
  const redirectUri = process.env.ROBLOX_REDIRECT_URI || `${origin}/api/auth/callback`;
  const state = crypto.randomUUID();

  if (!clientId) {
    return NextResponse.redirect(new URL("/?error=roblox_oauth_not_configured", request.url));
  }

  const returnUrl = searchParams.get("returnUrl");
  const safeReturn = returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//") ? returnUrl : "/";

  const authUrl = getRobloxAuthUrl(clientId, redirectUri, state);
  const response = NextResponse.redirect(authUrl);

  // Set CSRF state cookie
  response.cookies.set("roblox_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 15, // 15 minutes
    path: "/",
  });

  // Set return URL cookie if provided
  if (safeReturn !== "/") {
    response.cookies.set("oauth_return_url", safeReturn, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 15,
      path: "/",
    });
  }

  return response;
}
