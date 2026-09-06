import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { tips, userModeration, siteSettings } from "@/db/schema";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifySessionToken } from "@/lib/auth";
import { eq, and, or, isNull, gt } from "drizzle-orm";

export const runtime = "edge";

const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 5000;

export async function GET() {
  try {
    const d1 = (process.env as any).DB as D1Database;
    let tiplineAccess = "public";
    if (d1) {
      const db = getDb(d1);
      const settingsRow = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, "main_config"))
        .limit(1);

      if (settingsRow.length > 0) {
        try {
          const cfg = JSON.parse(settingsRow[0].valueJson);
          if (cfg.tiplineAccess) tiplineAccess = cfg.tiplineAccess;
        } catch {}
      }
    }
    return NextResponse.json({ tiplineAccess });
  } catch {
    return NextResponse.json({ tiplineAccess: "public" });
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Rate Limiting: Max 5 tips per 60 seconds per IP
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(`tips:${clientIp}`, 5, 60);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Please wait ${rateLimit.resetInSeconds}s before submitting another tip.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.resetInSeconds) },
        }
      );
    }

    // 2. Check Session & Moderation / Mute Status
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    let verifiedUser: any = null;

    if (token) {
      verifiedUser = await verifySessionToken(token);
    }

    const d1 = (process.env as any).DB as D1Database;
    let tiplineAccess = "public";

    if (d1) {
      const db = getDb(d1);

      // Check tiplineAccess in siteSettings
      const settingsRow = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, "main_config"))
        .limit(1);

      if (settingsRow.length > 0) {
        try {
          const cfg = JSON.parse(settingsRow[0].valueJson);
          if (cfg.tiplineAccess) tiplineAccess = cfg.tiplineAccess;
        } catch {}
      }

      // Check if Tipline requires authenticated user
      if (tiplineAccess === "members_only" && !verifiedUser) {
        return NextResponse.json(
          { error: "Authentication required: The tipline is currently restricted to logged-in users." },
          { status: 401 }
        );
      }

      if (verifiedUser) {
        try {
          const now = new Date();
          const activeMute = await db
            .select()
            .from(userModeration)
            .where(
              and(
                eq(userModeration.userId, verifiedUser.id),
                or(isNull(userModeration.expiresAt), gt(userModeration.expiresAt, now))
              )
            )
            .limit(1);

          if (activeMute.length > 0) {
            const mute = activeMute[0];
            const expiryText = mute.expiresAt
              ? `until ${new Date(mute.expiresAt).toLocaleDateString()}`
              : "indefinitely";
            return NextResponse.json(
              {
                error: `Your account is currently muted and cannot submit tips ${expiryText}. Reason: ${mute.reason}`,
              },
              { status: 403 }
            );
          }
        } catch (muteErr) {
          console.warn("Tipline moderation check bypassed:", muteErr);
        }
      }
    } else if (tiplineAccess === "members_only" && !verifiedUser) {
      return NextResponse.json(
        { error: "Authentication required: The tipline is currently restricted to logged-in users." },
        { status: 401 }
      );
    }

    // 3. Payload Validation & HTML Stripping
    const body = (await request.json().catch(() => ({}))) as {
      subject?: string;
      message?: string;
      urgency?: "standard" | "urgent" | "breaking";
      shareUsername?: boolean;
    };

    const subject = (body?.subject?.trim() || "").replace(/<[^>]*>/g, "").trim();
    const message = (body?.message?.trim() || "").replace(/<[^>]*>/g, "").trim();
    const urgency = body?.urgency;
    const shareUsername = Boolean(body?.shareUsername);

    if (!subject || !message) {
      return NextResponse.json({ error: "Subject and details are required." }, { status: 400 });
    }

    if (subject.length > MAX_SUBJECT_LENGTH) {
      return NextResponse.json(
        { error: `Subject exceeds maximum length of ${MAX_SUBJECT_LENGTH} characters.` },
        { status: 400 }
      );
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const VALID_URGENCIES = ["standard", "urgent", "breaking"];
    const safeUrgency = urgency && VALID_URGENCIES.includes(urgency) ? urgency : "standard";

    let contactInfo: string | null = `urgency:${safeUrgency}`;

    if (verifiedUser) {
      contactInfo = `roblox:@${verifiedUser.robloxUsername} (uid:${verifiedUser.id}) | urgency:${safeUrgency}${shareUsername ? " [shared]" : " [private]"}`;
    }

    if (!d1) {
      return NextResponse.json({
        success: true,
        referenceId: crypto.randomUUID().slice(0, 8),
        message: "Tip submitted securely.",
      });
    }

    const db = getDb(d1);
    const referenceId = crypto.randomUUID().slice(0, 8);

    await db.insert(tips).values({
      id: crypto.randomUUID(),
      subject: subject,
      details: message,
      contactChannel: contactInfo,
      status: "unread",
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      referenceId,
      message: "Tip submitted securely.",
    });
  } catch (error: any) {
    console.error("Tip submission error:", error);
    return NextResponse.json({ error: "Failed to submit tip securely. Please try again." }, { status: 500 });
  }
}
