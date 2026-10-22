import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { canManageRadio } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { loadShowsAndBroadcasts } from "@/lib/schedule";
import { validateBroadcastInput, BroadcastInput } from "@/lib/schedule-validation";
import { insertBroadcast, radioConflictMessage, serializeBroadcast, valuesToRecord } from "@/lib/broadcast-admin";

export const runtime = "edge";

const FORBIDDEN = "Forbidden: Broadcast Division role required";

export async function GET(request: NextRequest) {
  const auth = await requireStaff(request, canManageRadio, FORBIDDEN);
  if ("error" in auth) return auth.error;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const { shows, broadcasts } = await loadShowsAndBroadcasts(getDb(d1));
  return NextResponse.json({ shows, broadcasts: broadcasts.map(serializeBroadcast) });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canManageRadio, FORBIDDEN);
    if ("error" in auth) return auth.error;
    const body = (await request.json().catch(() => ({}))) as BroadcastInput;
    const parsed = validateBroadcastInput(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);
    const { shows, broadcasts } = await loadShowsAndBroadcasts(db);
    if (parsed.values.showId && !shows.some((s) => s.id === parsed.values.showId)) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }

    const id = crypto.randomUUID();
    const conflict = radioConflictMessage(shows, broadcasts, valuesToRecord(id, parsed.values));
    if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });

    await insertBroadcast(db, id, parsed.values);
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    console.error("Create broadcast error:", error);
    return NextResponse.json({ error: "Failed to create broadcast" }, { status: 500 });
  }
}
