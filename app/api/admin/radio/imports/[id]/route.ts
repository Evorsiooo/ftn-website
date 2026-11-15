import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { radioImports } from "@/db/schema";
import { failure, radioAdmin } from "@/lib/radio/admin-route";
import { cancelJob, syncImport } from "@/lib/radio/library";

export const runtime = "edge";

// Stop an import: songs not started yet are cancelled; the one downloading finishes.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  try {
    const [row] = await ctx.db.select().from(radioImports).where(eq(radioImports.id, id));
    if (!row) return NextResponse.json({ error: "Import not found" }, { status: 404 });
    await cancelJob(ctx.db, id);
    const updated = await syncImport(ctx.db, row);
    return NextResponse.json({ import: updated });
  } catch (err) {
    return failure(err, "Could not stop the import");
  }
}
