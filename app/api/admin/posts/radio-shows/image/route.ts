import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-auth";
import { canManagePosts } from "@/lib/rbac";

export const runtime = "edge";

// Roblox avatars and show art drawn on a clip have to come from this site: an image from another
// site without CORS headers would stop the canvas from being turned into a video.
const HOSTS = new Set(["tr.rbxcdn.com", "t0.rbxcdn.com", "t1.rbxcdn.com", "t2.rbxcdn.com", "t3.rbxcdn.com", "t4.rbxcdn.com", "t5.rbxcdn.com", "t6.rbxcdn.com", "t7.rbxcdn.com", "radio-files.euno.cc"]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const auth = await requireStaff(request, canManagePosts, "Forbidden: Staff permissions required");
  if ("error" in auth) return auth.error;
  let url: URL;
  try {
    url = new URL(request.nextUrl.searchParams.get("u") ?? "");
  } catch {
    return NextResponse.json({ error: "Bad image address" }, { status: 400 });
  }
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname)) return NextResponse.json({ error: "Image host not allowed" }, { status: 400 });
  const res = await fetch(url.toString());
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  const data = await res.arrayBuffer();
  if (data.byteLength > MAX_BYTES) return NextResponse.json({ error: "Image too large" }, { status: 413 });
  return new NextResponse(data, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
}
