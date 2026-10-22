import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { radioSlots } from "@/db/schema";
import { canManageRadio } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";

export const runtime = "edge";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
    if ("error" in auth) return auth.error;
    const { id } = await params;
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    await getDb(d1).delete(radioSlots).where(eq(radioSlots.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete slot error:", error);
    return NextResponse.json({ error: "Failed to delete slot" }, { status: 500 });
  }
}
