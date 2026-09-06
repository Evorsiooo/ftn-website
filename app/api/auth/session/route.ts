import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { getDb } from "@/db";
import { userModeration } from "@/db/schema";
import { eq, and, or, isNull, gt } from "drizzle-orm";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const token =
    request.cookies.get("ftn_session")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ authenticated: false, user: null, isMuted: false });
  }

  const user = await verifySessionToken(token);
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null, isMuted: false });
  }

  let isMuted = false;
  let muteDetails: any = null;

  try {
    const d1 = (process.env as any).DB as D1Database;
    if (d1) {
      const db = getDb(d1);
      const now = new Date();
      const activeMute = await db
        .select()
        .from(userModeration)
        .where(
          and(
            eq(userModeration.userId, user.id),
            or(isNull(userModeration.expiresAt), gt(userModeration.expiresAt, now))
          )
        )
        .limit(1);

      if (activeMute.length > 0) {
        isMuted = true;
        muteDetails = {
          reason: activeMute[0].reason,
          duration: activeMute[0].duration,
          expiresAt: activeMute[0].expiresAt,
        };
      }
    }
  } catch (err) {
    console.warn("Session mute check bypassed:", err);
  }

  return NextResponse.json({
    authenticated: true,
    user,
    isMuted,
    muteDetails,
  });
}
