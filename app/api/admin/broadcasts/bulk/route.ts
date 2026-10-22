import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { broadcasts as broadcastsTable } from "@/db/schema";
import { canManageRadio } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { BroadcastRecord, loadShowsAndBroadcasts } from "@/lib/schedule";
import { validateBulk } from "@/lib/schedule-validation";
import { radioConflictMessage } from "@/lib/broadcast-admin";

export const runtime = "edge";

const WEEK_MINUTES = 7 * 24 * 60;

function shifted(b: BroadcastRecord, minutes: number): BroadcastRecord {
  if (b.kind === "once" && b.startsAt && b.endsAt) {
    return { ...b, startsAt: new Date(b.startsAt.getTime() + minutes * 60000), endsAt: new Date(b.endsAt.getTime() + minutes * 60000) };
  }
  if (b.dayOfWeek === null || b.startMinute === null) return b;
  const total = (((b.dayOfWeek * 1440 + b.startMinute + minutes) % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
  return { ...b, dayOfWeek: Math.floor(total / 1440), startMinute: total % 1440 };
}

// Bulk edits on selected broadcasts. All-or-nothing: a radio overlap rejects the whole request.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
    if ("error" in auth) return auth.error;
    const parsed = validateBulk(await request.json().catch(() => ({})));
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    if (parsed.action === "delete") {
      await db.delete(broadcastsTable).where(inArray(broadcastsTable.id, parsed.ids));
      return NextResponse.json({ success: true, count: parsed.ids.length });
    }

    const { shows, broadcasts } = await loadShowsAndBroadcasts(db);
    const selected = new Set(parsed.ids);
    const next = broadcasts.map((b) => {
      if (!selected.has(b.id)) return b;
      switch (parsed.action) {
        case "cancel":
          return { ...b, status: "cancelled" as const };
        case "restore":
          return { ...b, status: "scheduled" as const };
        case "setTag":
          return { ...b, tag: parsed.tag! };
        default:
          return shifted(b, parsed.minutes!);
      }
    });

    if (parsed.action === "shift" || parsed.action === "restore") {
      for (const b of next.filter((x) => selected.has(x.id))) {
        const conflict = radioConflictMessage(shows, next, b);
        if (conflict) return NextResponse.json({ error: `${b.title ?? "A broadcast"}: ${conflict}` }, { status: 409 });
      }
    }

    for (const b of next.filter((x) => selected.has(x.id))) {
      await db
        .update(broadcastsTable)
        .set({
          status: b.status,
          tag: b.tag,
          dayOfWeek: b.dayOfWeek,
          startMinute: b.startMinute,
          startsAt: b.startsAt,
          endsAt: b.endsAt,
          updatedAt: new Date(),
        })
        .where(eq(broadcastsTable.id, b.id));
    }
    return NextResponse.json({ success: true, count: selected.size });
  } catch (error) {
    console.error("Bulk broadcast error:", error);
    return NextResponse.json({ error: "Failed to update broadcasts" }, { status: 500 });
  }
}
