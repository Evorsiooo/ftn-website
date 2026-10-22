import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { radioShows, radioSlots } from "@/db/schema";
import { canManageRadio } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { validateSlotInput, SlotInput } from "@/lib/radio-validation";

export const runtime = "edge";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
    if ("error" in auth) return auth.error;
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as SlotInput;
    const parsed = validateSlotInput(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);
    const show = await db.select().from(radioShows).where(eq(radioShows.id, id)).limit(1);
    if (show.length === 0) return NextResponse.json({ error: "Show not found" }, { status: 404 });

    const slotId = crypto.randomUUID();
    await db.insert(radioSlots).values({ id: slotId, showId: id, ...parsed.values });
    return NextResponse.json({ success: true, id: slotId }, { status: 201 });
  } catch (error) {
    console.error("Create slot error:", error);
    return NextResponse.json({ error: "Failed to create slot" }, { status: 500 });
  }
}
