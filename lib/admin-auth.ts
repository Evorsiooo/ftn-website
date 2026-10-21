import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, RobloxUser } from "@/lib/auth";

// Shared guard for admin API routes: returns the user, or a ready-made error response.
export async function requireStaff(
  request: NextRequest,
  check: (roles: string[]) => boolean,
  forbiddenMessage = "Forbidden"
): Promise<{ user: RobloxUser } | { error: NextResponse }> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
  if (!token) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await verifySessionToken(token);
  if (!user || !check(user.roles || [])) {
    return { error: NextResponse.json({ error: forbiddenMessage }, { status: 403 }) };
  }
  return { user };
}

export function isSafeUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/");
}
