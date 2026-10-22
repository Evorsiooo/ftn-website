import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { canManageRadio } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { getSecureRadioSettings, rotateBroadcastPassword } from "@/lib/radio";

export const runtime = "edge";

function describe(secure: Awaited<ReturnType<typeof getSecureRadioSettings>>) {
  return {
    password: secure.currentPassword || null,
    lastRotatedAt: secure.lastRotatedAt,
    rotationFrequencyHours: secure.rotationFrequencyHours,
    rotationTimeUtc: secure.rotationTimeUtc,
    rotationConfigured: Boolean(secure.rotationEndpointUrl && secure.rotationEndpointToken),
  };
}

// Broadcast Division can view the current source password and rotate it on demand.
export async function GET(request: NextRequest) {
  const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
  if ("error" in auth) return auth.error;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  return NextResponse.json(describe(await getSecureRadioSettings(getDb(d1))), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
  if ("error" in auth) return auth.error;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const db = getDb(d1);
  const result = await rotateBroadcastPassword(db);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(describe(await getSecureRadioSettings(db)), {
    headers: { "Cache-Control": "no-store" },
  });
}
