import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adCampaigns, organizers } from "@/db/schema";
import { canManageAds } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { AdInput, validateAdInput } from "@/lib/ads";

export const runtime = "edge";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStaff(request, canManageAds, "Forbidden: Commercial Division role required");
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as AdInput;
    const parsed = validateAdInput(body, false);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const values = { ...parsed.values } as Record<string, unknown>;

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    if (body.organizerId !== undefined) {
      const organizer = await db.select().from(organizers).where(eq(organizers.id, body.organizerId)).limit(1);
      if (organizer.length === 0) {
        return NextResponse.json({ error: "Organizer not found" }, { status: 400 });
      }
      values.organizerId = organizer[0].id;
      values.advertiserName = organizer[0].name;
    }

    if (Object.keys(values).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await db.update(adCampaigns).set(values).where(eq(adCampaigns.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update ad campaign error:", error);
    return NextResponse.json({ error: "Failed to update ad campaign" }, { status: 500 });
  }
}
