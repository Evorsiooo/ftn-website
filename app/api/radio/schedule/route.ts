import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { siteSettings } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { canManageRadio } from "@/lib/rbac";
import { eq } from "drizzle-orm";

export const runtime = "edge";

const DEFAULT_SCHEDULE = [
  { id: "1", day: "Monday", time: "08:00 - 10:00", title: "Morning District Briefing", show: "Morning District Briefing", presenter: "Elena Vance" },
  { id: "2", day: "Monday", time: "18:00 - 20:00", title: "Drive Time Melodies", show: "Drive Time Melodies", presenter: "Marcus Lee" },
  { id: "3", day: "Wednesday", time: "20:00 - 22:00", title: "The State of Roblox Politics Live", show: "The State of Roblox Politics Live", presenter: "Broadcast Panel" },
  { id: "4", day: "Friday", time: "21:00 - 01:00", title: "Friday Night Pulse DJ Mix", show: "Friday Night Pulse DJ Mix", presenter: "DJ Nova" },
  { id: "5", day: "Saturday", time: "14:00 - 17:00", title: "Sports Grandstand Live Telemetry", show: "Sports Grandstand Live Telemetry", presenter: "Sports Division" },
];

export async function GET() {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (d1) {
      const db = getDb(d1);
      const rows = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, "radio_schedule"))
        .limit(1);

      if (rows.length > 0 && rows[0].valueJson) {
        const parsed = JSON.parse(rows[0].valueJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return NextResponse.json({ schedule: parsed });
        }
      }
    }
  } catch (err) {
    console.error("Failed to load radio schedule from db:", err);
  }
  return NextResponse.json({ schedule: DEFAULT_SCHEDULE });
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || !canManageRadio(user.roles)) {
      return NextResponse.json({ error: "Forbidden: Broadcast Division role required" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      schedule?: Array<{
        id?: string;
        day: string;
        time: string;
        title?: string;
        show?: string;
        presenter?: string;
      }>;
    };

    if (!Array.isArray(body.schedule)) {
      return NextResponse.json({ error: "Invalid schedule format: array expected" }, { status: 400 });
    }

    const cleanedSchedule = body.schedule.map((item, idx) => ({
      id: item.id || `slot_${idx}_${Date.now()}`,
      day: String(item.day || "Monday").slice(0, 30),
      time: String(item.time || "").slice(0, 50),
      title: String(item.title || item.show || "Untitled Broadcast").slice(0, 150),
      show: String(item.title || item.show || "Untitled Broadcast").slice(0, 150),
      presenter: String(item.presenter || "Broadcast Staff").slice(0, 100),
    }));

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const db = getDb(d1);
    const serialized = JSON.stringify(cleanedSchedule);

    const rows = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, "radio_schedule"))
      .limit(1);

    if (rows.length > 0) {
      await db
        .update(siteSettings)
        .set({
          valueJson: serialized,
          updatedAt: new Date(),
        })
        .where(eq(siteSettings.key, "radio_schedule"));
    } else {
      await db.insert(siteSettings).values({
        key: "radio_schedule",
        valueJson: serialized,
        updatedAt: new Date(),
      });
    }

    return NextResponse.json({ success: true, schedule: cleanedSchedule });
  } catch (error: any) {
    console.error("Save radio schedule error:", error);
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
  }
}
