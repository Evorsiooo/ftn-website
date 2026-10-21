import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adCampaigns, organizers } from "@/db/schema";
import { canManageAds } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";

export const runtime = "edge";

const FORBIDDEN = "Forbidden: Commercial Division role required";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStaff(request, canManageAds, FORBIDDEN);
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { name?: string; notes?: string };
    const name = body.name?.trim();
    if (!name || name.length > 100) {
      return NextResponse.json({ error: "A name of 1 to 100 characters is required" }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    try {
      await db
        .update(organizers)
        .set({ name, notes: body.notes?.trim().slice(0, 500) || null })
        .where(eq(organizers.id, id));
    } catch {
      return NextResponse.json({ error: "An organizer with this name already exists" }, { status: 409 });
    }
    // Keep the denormalised advertiser name on the organizer's ads in sync.
    await db.update(adCampaigns).set({ advertiserName: name }).where(eq(adCampaigns.organizerId, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update organizer error:", error);
    return NextResponse.json({ error: "Failed to update organizer" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStaff(request, canManageAds, FORBIDDEN);
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    const existing = await db.select({ id: adCampaigns.id }).from(adCampaigns).where(eq(adCampaigns.organizerId, id)).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "Delete or reassign this organizer's ads first" }, { status: 409 });
    }
    await db.delete(organizers).where(eq(organizers.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete organizer error:", error);
    return NextResponse.json({ error: "Failed to delete organizer" }, { status: 500 });
  }
}
