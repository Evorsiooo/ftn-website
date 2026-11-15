import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { radioImports } from "@/db/schema";
import { failure, radioAdmin } from "@/lib/radio/admin-route";
import { cancelJob, syncImport } from "@/lib/radio/library";

export const runtime = "edge";

// Stop an import: songs not started yet are cancelled; the one downloading finishes but isn't added.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  try {
    const [row] = await ctx.db.select().from(radioImports).where(eq(radioImports.id, id));
    if (!row) return NextResponse.json({ error: "Import not found" }, { status: 404 });
    // Record what the downloader finished so far, then stop following the job here whatever the
    // downloader answers: a job stuck reading its list may never reach a state it can cancel from.
    let current = row;
    try {
      current = await syncImport(ctx.db, row);
    } catch {}
    let note: string | null = null;
    try {
      await cancelJob(ctx.db, id);
    } catch (err: any) {
      note = `Stopped here; the downloader didn't confirm (${err?.message || "no answer"}).`;
    }
    const patch = { state: "cancelled", error: note, updatedAt: new Date() };
    await ctx.db.update(radioImports).set(patch).where(eq(radioImports.id, id));
    return NextResponse.json({ import: { ...current, ...patch } });
  } catch (err) {
    return failure(err, "Could not stop the import");
  }
}
