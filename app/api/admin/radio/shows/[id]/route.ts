import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { radioShows, radioSlots } from "@/db/schema";
import { canManageRadio } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { validateShowInput, ShowInput } from "@/lib/radio-validation";

export const runtime = "edge";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
    if ("error" in auth) return auth.error;
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as ShowInput;
    const parsed = validateShowInput(body, false);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (Object.keys(parsed.values).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    await getDb(d1).update(radioShows).set(parsed.values).where(eq(radioShows.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update show error:", error);
    return NextResponse.json({ error: "Failed to update show" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
    if ("error" in auth) return auth.error;
    const { id } = await params;
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);
    // Remove slots explicitly in case foreign key enforcement is off.
    await db.delete(radioSlots).where(eq(radioSlots.showId, id));
    await db.delete(radioShows).where(eq(radioShows.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete show error:", error);
    return NextResponse.json({ error: "Failed to delete show" }, { status: 500 });
  }
}
