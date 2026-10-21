import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { organizers } from "@/db/schema";
import { canManageAds } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";

export const runtime = "edge";

const FORBIDDEN = "Forbidden: Commercial Division role required";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canManageAds, FORBIDDEN);
    if ("error" in auth) return auth.error;

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ organizers: [] });

    const rows = await getDb(d1).select().from(organizers).orderBy(asc(organizers.name));
    return NextResponse.json({ organizers: rows });
  } catch (error) {
    console.error("Load organizers error:", error);
    return NextResponse.json({ error: "Failed to load organizers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canManageAds, FORBIDDEN);
    if ("error" in auth) return auth.error;

    const body = (await request.json().catch(() => ({}))) as { name?: string; notes?: string };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Organizer name is required" }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: "Organizer name exceeds 100 characters" }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

    const organizer = {
      id: crypto.randomUUID(),
      name,
      notes: body.notes?.trim().slice(0, 500) || null,
      createdAt: new Date(),
    };
    try {
      await getDb(d1).insert(organizers).values(organizer);
    } catch {
      return NextResponse.json({ error: "An organizer with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ organizer }, { status: 201 });
  } catch (error) {
    console.error("Create organizer error:", error);
    return NextResponse.json({ error: "Failed to create organizer" }, { status: 500 });
  }
}
