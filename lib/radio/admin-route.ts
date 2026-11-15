import { NextRequest, NextResponse } from "next/server";
import { getDb, type DbClient } from "@/db";
import { requireStaff } from "@/lib/admin-auth";
import type { RobloxUser } from "@/lib/auth";
import { canManageRadio } from "@/lib/rbac";
import { DownloaderError } from "./library";

/** Broadcast role (or leadership) and the database, or a ready-made error response. */
export async function radioAdmin(request: NextRequest): Promise<{ user: RobloxUser; db: DbClient } | { error: NextResponse }> {
  const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
  if ("error" in auth) return auth;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return { error: NextResponse.json({ error: "Database unavailable" }, { status: 500 }) };
  return { user: auth.user, db: getDb(d1) };
}

export function failure(err: unknown, fallback: string) {
  if (err instanceof DownloaderError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(fallback, err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
