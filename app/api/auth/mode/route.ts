import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { siteSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "edge";

export async function GET() {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({
        mode: "roblox",
        allowSignIn: true,
      });
    }

    const db = getDb(d1);
    const row = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, "general"))
      .limit(1);

    if (row.length > 0) {
      try {
        const parsed = JSON.parse(row[0].valueJson);
        return NextResponse.json({
          mode: parsed.authMode === "credentials" ? "credentials" : "roblox",
          allowSignIn: parsed.allowSignIn !== false,
        });
      } catch {}
    }

    return NextResponse.json({
      mode: "roblox",
      allowSignIn: true,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      mode: "roblox",
      allowSignIn: true,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  }
}
