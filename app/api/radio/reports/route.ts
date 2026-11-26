import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { radioReportBlocks, radioReports, siteSettings, userModeration } from "@/db/schema";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifySessionToken, type RobloxUser } from "@/lib/auth";
import { BUG_REASONS, MAX_DETAILS, MAX_DIAGNOSTICS, REPORT_SOURCES, SONG_REASONS, cleanDiagnostics } from "@/lib/radio/reports";

export const runtime = "edge";

type Access = "public" | "members_only" | "off";
const DAY = 86_400_000;

async function readAccess(db: ReturnType<typeof getDb>): Promise<Access> {
  try {
    const [row] = await db.select({ v: siteSettings.valueJson }).from(siteSettings).where(eq(siteSettings.key, "main_config")).limit(1);
    const a = row ? JSON.parse(row.v)?.reportsAccess : undefined;
    return a === "members_only" || a === "off" ? a : "public";
  } catch {
    return "public";
  }
}

async function sessionUser(request: NextRequest): Promise<RobloxUser | null> {
  const token = request.headers.get("authorization")?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
  if (!token) return null;
  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

/** A keyed hash of the sender's network address: enough to limit and block them, without keeping the address. */
async function senderHash(ip: string): Promise<string> {
  const secret = process.env.JWT_SECRET || "ftn-local-development-only-jwt-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`radio-report:${ip}`)));
  return Array.from(sig.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cloudflare Turnstile (the invisible "is this a person" check). Only when its keys are set on the site. */
async function passesTurnstile(token: unknown, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 4096) return false;
  try {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    form.append("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const d = (await r.json()) as { success?: boolean };
    return !!d.success;
  } catch {
    // Cloudflare's check itself failing must not close reporting: the limits still apply
    return true;
  }
}

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/<[^>]*>/g, "").replace(/\s+\n/g, "\n").trim().slice(0, n) : "");

// What the report window needs when it opens: who may report, whether this listener is signed in, and the
// Turnstile site key (public). Read only when the window is opened, never on page load.
export async function GET(request: NextRequest) {
  const d1 = (process.env as any).DB as D1Database;
  const [access, user] = await Promise.all([d1 ? readAccess(getDb(d1)) : Promise.resolve<Access>("public"), sessionUser(request)]);
  return NextResponse.json(
    { access, signedIn: !!user, username: user?.robloxUsername ?? null, turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Reports are unavailable right now." }, { status: 503 });
    const db = getDb(d1);
    const ip = getClientIp(request);
    const hash = await senderHash(ip);

    // 3 reports per 10 minutes and 10 a day, per network
    const short = await checkRateLimit(`report:${hash}`, 3, 600);
    const day = short.allowed ? await checkRateLimit(`report-day:${hash}`, 10, 86_400) : short;
    const limited = !short.allowed ? short : !day.allowed ? day : null;
    if (limited) {
      const mins = Math.max(1, Math.ceil(limited.resetInSeconds / 60));
      return NextResponse.json(
        { error: `You've sent a lot of reports. Please try again in ${mins >= 60 ? `${Math.ceil(mins / 60)} hours` : `${mins} minutes`}.` },
        { status: 429, headers: { "Retry-After": String(limited.resetInSeconds) } },
      );
    }

    const [access, user] = await Promise.all([readAccess(db), sessionUser(request)]);
    if (access === "off") return NextResponse.json({ error: "Reports are turned off right now." }, { status: 403 });
    if (access === "members_only" && !user) return NextResponse.json({ error: "Sign in to report a problem." }, { status: 401 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid report." }, { status: 400 });
    const kind = body.kind === "song" ? "song" : body.kind === "bug" ? "bug" : null;
    const reason = typeof body.reason === "string" ? body.reason : "";
    const source = typeof body.source === "string" && body.source in REPORT_SOURCES ? body.source : null;
    if (!kind || !source || !(kind === "song" ? (SONG_REASONS as readonly string[]) : (BUG_REASONS as readonly string[])).includes(reason)) {
      return NextResponse.json({ error: "Invalid report." }, { status: 400 });
    }
    const details = clean(body.details, MAX_DETAILS);
    const songKey = typeof body.songKey === "string" && body.songKey.length <= 420 ? body.songKey : null;
    if (kind === "song" && !songKey) return NextResponse.json({ error: "Pick the song." }, { status: 400 });
    if (kind === "bug" && details.length < 5) return NextResponse.json({ error: "Describe what's happening." }, { status: 400 });
    let diagnostics: string | null = null;
    if (body.diagnostics) {
      const d = cleanDiagnostics(body.diagnostics);
      diagnostics = d ? JSON.stringify(d) : null;
      if (diagnostics && diagnostics.length > MAX_DIAGNOSTICS) diagnostics = JSON.stringify({ ...d, log: (d!.log ?? []).slice(-5) }).slice(0, MAX_DIAGNOSTICS);
    }

    if (!(await passesTurnstile(body.turnstileToken, ip))) {
      return NextResponse.json({ error: "We couldn't check that you're a person. Reload the page and try again." }, { status: 403 });
    }

    // blocked by staff (primary key lookups), or muted
    const now = new Date();
    const keys = [`net:${hash}`, ...(user ? [`user:${user.id}`] : [])];
    const [blocked] = await db
      .select({ key: radioReportBlocks.key })
      .from(radioReportBlocks)
      .where(and(inArray(radioReportBlocks.key, keys), or(isNull(radioReportBlocks.expiresAt), gt(radioReportBlocks.expiresAt, now))))
      .limit(1);
    // answered like a success: a blocked spammer gets no signal to work around
    if (blocked) return NextResponse.json({ success: true });
    if (user) {
      const [mute] = await db
        .select({ id: userModeration.id })
        .from(userModeration)
        .where(and(eq(userModeration.userId, user.id), or(isNull(userModeration.expiresAt), gt(userModeration.expiresAt, now))))
        .limit(1);
      if (mute) return NextResponse.json({ error: "Your account is muted, so it can't send reports right now." }, { status: 403 });
    }

    const songTitle = kind === "song" || songKey ? clean(body.songTitle, 300) || null : null;
    const songArtist = kind === "song" || songKey ? clean(body.songArtist, 300) || null : null;

    // the same sender reporting the same song for the same reason again updates their earlier report
    if (kind === "song") {
      const [prev] = await db
        .select({ id: radioReports.id })
        .from(radioReports)
        .where(and(eq(radioReports.senderHash, hash), eq(radioReports.songKey, songKey!), eq(radioReports.reason, reason), eq(radioReports.status, "new")))
        .limit(1);
      if (prev) {
        await db
          .update(radioReports)
          .set({ details: details || undefined, diagnostics: diagnostics ?? undefined, source, userId: user?.id ?? null, username: user?.robloxUsername ?? null, updatedAt: now })
          .where(eq(radioReports.id, prev.id));
        return NextResponse.json({ success: true });
      }
    }

    await db.insert(radioReports).values({
      id: crypto.randomUUID(),
      kind,
      reason,
      songKey,
      songTitle,
      songArtist,
      details,
      diagnostics,
      source,
      userId: user?.id ?? null,
      username: user?.robloxUsername ?? null,
      senderHash: hash,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });

    // now and then, forget reports older than 90 days (radio_reports_created_idx: reads only those)
    if (Math.random() < 0.05) {
      await db.delete(radioReports).where(lt(radioReports.createdAt, new Date(now.getTime() - 90 * DAY))).catch(() => {});
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("radio report error:", error);
    return NextResponse.json({ error: "Couldn't send the report. Please try again." }, { status: 500 });
  }
}
