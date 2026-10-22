import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { getSecureRadioSettings, isRotationDue, rotateBroadcastPassword } from "@/lib/radio";

export const runtime = "edge";

// Called hourly by the scheduled GitHub workflow. Rotates only when the configured
// automatic schedule says a rotation is due.
export async function POST(request: NextRequest) {
  const expected = process.env.RADIO_CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  if (!expected || !provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const db = getDb(d1);

  const secure = await getSecureRadioSettings(db);
  if (!isRotationDue(secure)) return NextResponse.json({ rotated: false });

  const result = await rotateBroadcastPassword(db);
  if (!result.ok) return NextResponse.json({ rotated: false, error: result.error }, { status: 502 });
  return NextResponse.json({ rotated: true });
}
