import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const expectedKey = (process.env.EMERGENCY_AUTH_KEY || "").trim();
    if (!expectedKey) {
      return NextResponse.json(
        { error: "OAuth access key is not configured." },
        { status: 503 }
      );
    }

    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(`emergency:${clientIp}`, 10, 60);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Too many attempts. Please wait ${rateLimit.resetInSeconds}s before trying again.`,
        },
        { status: 429 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      accessKey?: string;
    };

    const providedKey = (body?.accessKey || "").trim();

    if (!providedKey) {
      return NextResponse.json(
        { error: "Access key is required." },
        { status: 400 }
      );
    }

    // Resilient comparison: checks exact, backtick variation, or stripped quotes
    const stripQuotes = (s: string) => s.replace(/^['"`\s]+|['"`\s]+$/g, "");
    const isDirectMatch = providedKey === expectedKey;
    const isStrippedMatch = stripQuotes(providedKey) === stripQuotes(expectedKey);
    const isBacktickMatch =
      (providedKey.startsWith("`") ? providedKey : "`" + providedKey) ===
      (expectedKey.startsWith("`") ? expectedKey : "`" + expectedKey);

    if (!isDirectMatch && !isStrippedMatch && !isBacktickMatch) {
      return NextResponse.json(
        { error: "Invalid access key." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      redirectUrl: "/api/auth/roblox?force=true",
    });
  } catch (error: any) {
    console.error("Emergency auth error:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
