import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { radioShows } from "@/db/schema";
import { canManageRadio } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { loadShowsAndBroadcasts } from "@/lib/schedule";
import { validateShowInput, ShowInput } from "@/lib/radio-validation";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
  if ("error" in auth) return auth.error;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const { shows } = await loadShowsAndBroadcasts(getDb(d1));
  return NextResponse.json({ shows });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
    if ("error" in auth) return auth.error;
    const body = (await request.json().catch(() => ({}))) as ShowInput;
    const parsed = validateShowInput(body, true);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const id = crypto.randomUUID();
    await getDb(d1).insert(radioShows).values({ id, ...(parsed.values as any) });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    console.error("Create show error:", error);
    return NextResponse.json({ error: "Failed to create show" }, { status: 500 });
  }
}
