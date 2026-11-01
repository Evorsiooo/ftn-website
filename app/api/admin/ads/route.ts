import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adCampaigns, organizers } from "@/db/schema";
import { canManageAds } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { AdInput, validateAdInput } from "@/lib/ads";

export const runtime = "edge";

const FORBIDDEN = "Forbidden: Commercial Division role required";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canManageAds, FORBIDDEN);
    if ("error" in auth) return auth.error;

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ campaigns: [] });
    }

    const db = getDb(d1);
    const rawCampaigns = await db.select().from(adCampaigns).orderBy(desc(adCampaigns.createdAt));
    const campaigns = rawCampaigns.map((c) => ({
      ...c,
      title: c.name,
      format: c.adFormat,
      impressionsLeft:
        c.postImpressionsPurchased === null
          ? null
          : Math.max(0, c.postImpressionsPurchased - c.postImpressionsUsed),
    }));
    return NextResponse.json({ campaigns });
  } catch (error: any) {
    console.error("Load ad campaigns error:", error);
    return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canManageAds, FORBIDDEN);
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing campaign id" }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    await getDb(d1).delete(adCampaigns).where(eq(adCampaigns.id, id));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete ad campaign error:", error);
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canManageAds, FORBIDDEN);
    if ("error" in auth) return auth.error;

    const body = (await request.json().catch(() => ({}))) as AdInput;
    const parsed = validateAdInput(body, true);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }
    const db = getDb(d1);

    const organizer = await db.select().from(organizers).where(eq(organizers.id, body.organizerId!)).limit(1);
    if (organizer.length === 0) {
      return NextResponse.json({ error: "Organizer not found" }, { status: 400 });
    }

    const v = parsed.values as any;
    const newCampaign = {
      id: crypto.randomUUID(),
      name: v.name,
      advertiserName: organizer[0].name,
      organizerId: organizer[0].id,
      imageUrl: v.imageUrl,
      targetUrl: v.targetUrl,
      messageLinks: v.messageLinks ?? null,
      postImpressionsPurchased: v.postImpressionsPurchased ?? null,
      adFormat: v.adFormat ?? "1024x180",
      zone: v.zone ?? "header_leaderboard",
      weight: 1,
      status: "active" as const,
      impressionsCount: 0,
      clicksCount: 0,
      startDate: v.startDate ?? new Date(),
      endDate: v.endDate ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    };

    await db.insert(adCampaigns).values(newCampaign);
    return NextResponse.json({ campaign: newCampaign }, { status: 201 });
  } catch (error: any) {
    console.error("Create ad campaign error:", error);
    return NextResponse.json({ error: "Failed to create ad campaign" }, { status: 500 });
  }
}
