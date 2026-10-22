import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { canManageRadio } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { diagnoseRadio, getSecureRadioSettings, getStreamConfig } from "@/lib/radio";

export const runtime = "edge";

// Shows what the edge can actually reach: the listener stream, public status JSON and admin stats.
export async function GET(request: NextRequest) {
  const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
  if ("error" in auth) return auth.error;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const db = getDb(d1);
  const [secure, stream] = await Promise.all([getSecureRadioSettings(db), getStreamConfig(db)]);
  return NextResponse.json(await diagnoseRadio(secure, stream), { headers: { "Cache-Control": "no-store" } });
}
