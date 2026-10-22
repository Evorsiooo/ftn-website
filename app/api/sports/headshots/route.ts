import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;

// Resolves Roblox usernames to headshot image URLs. Roblox has no username-to-thumbnail
// endpoint, so this looks up the user ids first, then asks the thumbnails API for them.
// Results are edge-cached for a day; a failure just means the page shows initials.
export async function GET(request: NextRequest) {
  const names = Array.from(
    new Set((new URL(request.url).searchParams.get("names") ?? "").split(",").map((n) => n.trim()).filter((n) => USERNAME.test(n)))
  ).slice(0, 50);
  if (names.length === 0) return NextResponse.json({ headshots: {} });

  try {
    const idRes = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: names, excludeBannedUsers: true }),
    });
    if (!idRes.ok) throw new Error("username lookup failed");
    const ids = ((await idRes.json()) as { data?: { id: number; requestedUsername: string }[] }).data ?? [];
    if (ids.length === 0) return NextResponse.json({ headshots: {} });

    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${ids.map((u) => u.id).join(",")}&size=150x150&format=Png&isCircular=false`
    );
    if (!thumbRes.ok) throw new Error("thumbnail lookup failed");
    const thumbs = ((await thumbRes.json()) as { data?: { targetId: number; state: string; imageUrl: string | null }[] }).data ?? [];
    const byId = new Map(thumbs.filter((t) => t.state === "Completed" && t.imageUrl).map((t) => [t.targetId, t.imageUrl as string]));

    const headshots: Record<string, string> = {};
    for (const u of ids) {
      const url = byId.get(u.id);
      if (url) headshots[u.requestedUsername.toLowerCase()] = url;
    }
    return NextResponse.json({ headshots }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch {
    return NextResponse.json({ headshots: {} });
  }
}
