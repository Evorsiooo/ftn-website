import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { broadcasts as broadcastsTable } from "@/db/schema";
import { canManageRadio } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { loadShowsAndBroadcasts } from "@/lib/schedule";
import { validateBroadcastInput, BroadcastInput } from "@/lib/schedule-validation";
import { radioConflictMessage, recordToInput, valuesToRecord } from "@/lib/broadcast-admin";

export const runtime = "edge";

const FORBIDDEN = "Forbidden: Broadcast Division role required";

// Partial update: the body is merged over the stored broadcast, then validated as a whole.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request, canManageRadio, FORBIDDEN);
    if ("error" in auth) return auth.error;
    const { id } = await params;
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    const { shows, broadcasts } = await loadShowsAndBroadcasts(db);
    const existing = broadcasts.find((b) => b.id === id);
    if (!existing) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as BroadcastInput;
    const parsed = validateBroadcastInput({ ...recordToInput(existing), ...body });
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (parsed.values.showId && !shows.some((s) => s.id === parsed.values.showId)) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }

    const conflict = radioConflictMessage(shows, broadcasts, valuesToRecord(id, parsed.values));
    if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });

    await db
      .update(broadcastsTable)
      .set({ ...parsed.values, updatedAt: new Date() })
      .where(eq(broadcastsTable.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update broadcast error:", error);
    return NextResponse.json({ error: "Failed to update broadcast" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request, canManageRadio, FORBIDDEN);
    if ("error" in auth) return auth.error;
    const { id } = await params;
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    await getDb(d1).delete(broadcastsTable).where(eq(broadcastsTable.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete broadcast error:", error);
    return NextResponse.json({ error: "Failed to delete broadcast" }, { status: 500 });
  }
}
