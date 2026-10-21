import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users, siteSettings } from "@/db/schema";
import { syncRobloxUserAndRoles, createSessionToken } from "@/lib/auth";
import { eq, sql } from "drizzle-orm";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const expectedState = request.cookies.get("roblox_oauth_state")?.value;

    if (!code) {
      return NextResponse.redirect(new URL("/?error=missing_authorization_code", request.url));
    }

    // Strict CSRF state verification
    if (!expectedState || !state || state !== expectedState) {
      console.warn("Roblox OAuth CSRF state mismatch or missing");
      return NextResponse.redirect(new URL("/?error=oauth_state_invalid", request.url));
    }

    const clientId = process.env.ROBLOX_CLIENT_ID;
    const clientSecret = process.env.ROBLOX_CLIENT_SECRET;
    const origin = new URL(request.url).origin;
    const redirectUri = process.env.ROBLOX_REDIRECT_URI || `${origin}/api/auth/callback`;

    if (!clientId || !clientSecret) {
      console.error("Roblox OAuth credentials are not configured on the server.");
      return NextResponse.redirect(new URL("/?error=oauth_configuration_error", request.url));
    }

    // 1. Exchange authorization code for access token
    const tokenResponse = await fetch("https://apis.roblox.com/oauth/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Roblox token exchange failed:", errorText);
      return NextResponse.redirect(new URL("/?error=oauth_exchange_failed", request.url));
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };

    // 2. Fetch authenticated Roblox User Profile
    const userinfoResponse = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userinfoResponse.ok) {
      console.error("Failed to fetch user profile from Roblox userinfo.");
      return NextResponse.redirect(new URL("/?error=userinfo_fetch_failed", request.url));
    }

    const userinfo = (await userinfoResponse.json()) as {
      sub: string;
      name?: string;
      preferred_username?: string;
      nickname?: string;
      picture?: string;
    };

    const robloxId = userinfo.sub;
    const robloxUsername = userinfo.preferred_username || userinfo.name || `User_${robloxId}`;
    const displayName = userinfo.nickname || userinfo.name || robloxUsername;
    const avatarUrl = userinfo.picture || `https://tr.rbxcdn.com/30DAY-AvatarHeadshot-${robloxId}/150/150/Png/noFilter`;

    const robloxProfile = {
      robloxId,
      robloxUsername,
      displayName,
      avatarUrl,
    };

    const d1 = (process.env as any).DB as D1Database;
    let user;

    if (d1) {
      const db = getDb(d1);

      // Check site configuration for account registration toggle
      let allowSignIn = true;
      try {
        const settingsRows = await db
          .select()
          .from(siteSettings)
          .where(eq(siteSettings.key, "main_config"))
          .limit(1);

        if (settingsRows.length > 0) {
          const config = JSON.parse(settingsRows[0].valueJson);
          if (typeof config.allowSignIn === "boolean") {
            allowSignIn = config.allowSignIn;
          }
        }
      } catch {}

      // Check if user already exists in database
      const normalizedCb = robloxUsername.toLowerCase();
      const existingUser = await db
        .select()
        .from(users)
        .where(
          sql`${users.robloxId} = ${robloxId} OR lower(${users.robloxUsername}) = ${normalizedCb}`
        )
        .limit(1);

      // If new account creation is disabled and user has no pre-existing account:
      if (!allowSignIn && existingUser.length === 0) {
        const res = NextResponse.redirect(new URL("/auth/disabled", request.url));
        res.cookies.delete("roblox_oauth_state");
        res.cookies.delete("oauth_return_url");
        return res;
      }

      user = await syncRobloxUserAndRoles(db, robloxProfile);
    } else {
      const normalized = robloxUsername.toLowerCase();
      const isAdmin = normalized === "alphaze1" || normalized === "evorsio";
      user = {
        id: crypto.randomUUID(),
        robloxId: robloxProfile.robloxId,
        robloxUsername: robloxProfile.robloxUsername,
        displayName: robloxProfile.displayName,
        avatarUrl: robloxProfile.avatarUrl,
        roles: isAdmin ? ["site_admin"] : [],
      };
    }

    const token = await createSessionToken(user);

    const returnUrl = request.cookies.get("oauth_return_url")?.value || "/";
    const isSafePath = /^\/[a-zA-Z0-9_\-\.\/?#&%=]*$/.test(returnUrl) && !returnUrl.startsWith("//");
    const safeTarget = isSafePath ? returnUrl : "/";

    const response = NextResponse.redirect(new URL(safeTarget, request.url));

    response.cookies.set("ftn_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    // Clear temporary OAuth cookies
    response.cookies.delete("roblox_oauth_state");
    response.cookies.delete("oauth_return_url");

    return response;
  } catch (error: any) {
    console.error("Auth callback unexpected error:", error);
    return NextResponse.redirect(new URL("/?error=authentication_failed", request.url));
  }
}
