import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { radioStudioPeople } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { liveStudio } from "@/lib/radio/program";
import { PROGRAM_KEY, type RadioProgram } from "@/lib/radio/program-types";
import { addUsage, checkSessionToken, CAP_BYTES, overCap, sessionToken, sfu } from "@/lib/radio/rtc";
import { noStore, radioBucket, radioDb } from "@/lib/radio/store";

export const runtime = "edge";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

/**
 * The only way browsers reach Cloudflare Realtime (SFU). Listeners open a session and receive the
 * voices of the people on air; people on air (signed in, put on air in the Studio) send theirs.
 * Every connected browser checks in once a minute (op "beat") with its track count: that feeds the
 * monthly usage cap, and past the cap the answer tells it to hang up.
 */
export async function POST(request: NextRequest) {
  const d1 = radioDb();
  if (!d1) return bad("Database unavailable", 503);
  const db = getDb(d1);
  const body = (await request.json().catch(() => ({}))) as Record<string, any>;
  const op = String(body.op ?? "");

  if (op === "session") {
    if (await overCap(db)) return bad("Voice is off for the rest of the month (usage cap).", 429);
    const r = await sfu("/sessions/new", { method: "POST" });
    if (!r.ok || !r.body?.sessionId) return bad(r.body?.errorDescription || r.body?.error || "Couldn't open a voice session", 502);
    return NextResponse.json({ sessionId: r.body.sessionId, token: await sessionToken(r.body.sessionId) }, { headers: noStore });
  }

  const sessionId = body.sessionId;
  if (!(await checkSessionToken(sessionId, body.token))) return bad("Not your session", 403);

  if (op === "beat") {
    const total = await addUsage(db, Number(body.tracks) || 0);
    return NextResponse.json({ stop: total >= CAP_BYTES }, { headers: noStore });
  }

  if (op === "push") {
    // only someone on air in the live show may send a voice
    const cookie = request.headers.get("authorization")?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    const user = cookie ? await verifySessionToken(cookie) : null;
    if (!user) return bad("Sign in first", 401);
    const s = await liveStudio(db);
    const [p] = s
      ? await db.select().from(radioStudioPeople).where(and(eq(radioStudioPeople.sessionId, s.id), eq(radioStudioPeople.userId, user.id), eq(radioStudioPeople.state, "on_air")))
      : [];
    if (!p) return bad("You're not on air", 403);
    if (await overCap(db)) return bad("Voice is off for the rest of the month (usage cap).", 429);
    const tracks = Array.isArray(body.tracks) ? body.tracks.slice(0, 1).map((t: any) => ({ location: "local", mid: String(t.mid), trackName: String(t.trackName).slice(0, 100) })) : [];
    if (!tracks.length || body.offer?.type !== "offer") return bad("Missing offer or track");
    const r = await sfu(`/sessions/${encodeURIComponent(sessionId)}/tracks/new`, { method: "POST", body: { sessionDescription: { type: "offer", sdp: String(body.offer.sdp) }, tracks } });
    if (!r.ok) return bad(r.body?.errorDescription || "Couldn't send your voice", 502);
    return NextResponse.json(r.body, { headers: noStore });
  }

  if (op === "pull") {
    if (await overCap(db)) return bad("Voice is off for the rest of the month (usage cap).", 429);
    const obj = await radioBucket()?.get(PROGRAM_KEY);
    const program = obj ? ((await obj.json().catch(() => null)) as RadioProgram | null) : null;
    const allowed = new Set((program?.studio?.voices ?? []).filter((v) => v.session && v.track).map((v) => `${v.session}/${v.track}`));
    const wanted = Array.isArray(body.tracks) ? body.tracks.slice(0, 8) : [];
    const tracks = wanted
      .map((t: any) => ({ location: "remote", sessionId: String(t.sessionId), trackName: String(t.trackName) }))
      .filter((t: { sessionId: string; trackName: string }) => allowed.has(`${t.sessionId}/${t.trackName}`));
    if (!tracks.length) return bad("Nobody to listen to", 404);
    const r = await sfu(`/sessions/${encodeURIComponent(sessionId)}/tracks/new`, { method: "POST", body: { tracks } });
    if (!r.ok) return bad(r.body?.errorDescription || "Couldn't receive the voices", 502);
    return NextResponse.json(r.body, { headers: noStore });
  }

  if (op === "renegotiate") {
    if (body.answer?.type !== "answer") return bad("Missing answer");
    const r = await sfu(`/sessions/${encodeURIComponent(sessionId)}/renegotiate`, { method: "PUT", body: { sessionDescription: { type: "answer", sdp: String(body.answer.sdp) } } });
    if (!r.ok) return bad(r.body?.errorDescription || "Renegotiation failed", 502);
    return NextResponse.json(r.body, { headers: noStore });
  }

  if (op === "close") {
    const mids = Array.isArray(body.mids) ? body.mids.slice(0, 8).map((m: unknown) => ({ mid: String(m) })) : [];
    if (!mids.length) return NextResponse.json({ ok: true });
    const r = await sfu(`/sessions/${encodeURIComponent(sessionId)}/tracks/close`, { method: "PUT", body: { tracks: mids, force: true } });
    return NextResponse.json(r.body, { headers: noStore });
  }

  return bad("Unknown action");
}
