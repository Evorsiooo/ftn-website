import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { isPostsLeadership } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { decidePost } from "@/lib/post-decision";

export const runtime = "edge";

// Leadership approves or denies a pending post from the website.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStaff(request, isPostsLeadership, "Forbidden: Leadership role required");
    if ("error" in auth) return auth.error;
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as { decision?: string; reason?: string };
    if (body.decision !== "approve" && body.decision !== "deny") {
      return NextResponse.json({ error: "Decision must be approve or deny" }, { status: 400 });
    }
    const reason = body.reason?.trim() || "";
    if (body.decision === "deny" && (!reason || reason.length > 500)) {
      return NextResponse.json({ error: "A reason of 1 to 500 characters is required to deny" }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    const result = await decidePost(db, id, body.decision, reason, {
      userId: auth.user.id,
      label: `${auth.user.displayName} (website)`,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    if (result.warning) return NextResponse.json({ success: true, warning: result.warning });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Post decision error:", error);
    return NextResponse.json({ error: "Failed to save decision" }, { status: 500 });
  }
}
