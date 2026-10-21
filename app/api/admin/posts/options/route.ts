import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { canManagePosts } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { suggestAdId } from "@/lib/posts";

export const runtime = "edge";

// Ads a post can use, plus the one the rotation suggests.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canManagePosts, "Forbidden: Staff permissions required");
    if ("error" in auth) return auth.error;

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ ads: [], suggestedAdId: null });

    const { ads, suggestedAdId } = await suggestAdId(getDb(d1));
    return NextResponse.json({
      suggestedAdId,
      ads: ads.map((a) => ({
        id: a.id,
        title: a.name,
        organizerName: a.advertiserName,
        imageUrl: a.imageUrl,
        impressionsLeft:
          a.postImpressionsPurchased === null ? null : Math.max(0, a.postImpressionsPurchased - a.postImpressionsUsed),
      })),
    });
  } catch (error) {
    console.error("Load post options error:", error);
    return NextResponse.json({ error: "Failed to load ads" }, { status: 500 });
  }
}
