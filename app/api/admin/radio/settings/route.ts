import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { canConfigureSite } from "@/lib/rbac";
import { requireStaff, isSafeUrl } from "@/lib/admin-auth";
import {
  getPublicRadioSettings,
  getSecureRadioSettings,
  savePublicRadioSettings,
  saveSecureRadioSettings,
  ArtProvider,
} from "@/lib/radio";

export const runtime = "edge";

const PROVIDERS: ArtProvider[] = ["lastfm", "itunes", "fanart"];
const FREQUENCIES = [0, 12, 24, 48, 72];

function str(value: unknown, fallback: string, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

function url(value: unknown, fallback: string): string {
  const v = str(value, fallback);
  return v === "" || isSafeUrl(v) ? v : fallback;
}

// Site administrators only: includes Icecast credentials and API keys.
// The current broadcast password is deliberately never returned here.
export async function GET(request: NextRequest) {
  const auth = await requireStaff(request, canConfigureSite, "Forbidden: Administrator role required");
  if ("error" in auth) return auth.error;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const db = getDb(d1);
  const { currentPassword: _omit, ...secure } = await getSecureRadioSettings(db);
  return NextResponse.json({ public: await getPublicRadioSettings(db), secure });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canConfigureSite, "Forbidden: Administrator role required");
    if ("error" in auth) return auth.error;
    const body = (await request.json().catch(() => ({}))) as any;
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    const pubIn = body.public || {};
    const pubCur = await getPublicRadioSettings(db);
    await savePublicRadioSettings(db, {
      discordBotLink: url(pubIn.discordBotLink, pubCur.discordBotLink),
      discordBotCommand: str(pubIn.discordBotCommand, pubCur.discordBotCommand, 200),
      defaultArtUrl: url(pubIn.defaultArtUrl, pubCur.defaultArtUrl),
      stationName: str(pubIn.stationName, pubCur.stationName, 80) || pubCur.stationName,
    });

    const secIn = body.secure || {};
    const secCur = await getSecureRadioSettings(db);
    const priority = Array.isArray(secIn.artPriority)
      ? (secIn.artPriority as unknown[]).filter((p): p is ArtProvider => PROVIDERS.includes(p as ArtProvider))
      : secCur.artPriority;
    const freq = Number(secIn.rotationFrequencyHours);
    const time = typeof secIn.rotationTimeUtc === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(secIn.rotationTimeUtc)
      ? secIn.rotationTimeUtc
      : secCur.rotationTimeUtc;

    await saveSecureRadioSettings(db, {
      ...secCur,
      icecastAdminUrl: url(secIn.icecastAdminUrl, secCur.icecastAdminUrl),
      icecastUsername: str(secIn.icecastUsername, secCur.icecastUsername, 100),
      icecastPassword: str(secIn.icecastPassword, secCur.icecastPassword, 200),
      icecastMount: str(secIn.icecastMount, secCur.icecastMount, 100),
      lastFmApiKey: str(secIn.lastFmApiKey, secCur.lastFmApiKey, 200),
      fanartTvApiKey: str(secIn.fanartTvApiKey, secCur.fanartTvApiKey, 200),
      artPriority: priority.length > 0 ? priority : secCur.artPriority,
      discordWebhookUrl: url(secIn.discordWebhookUrl, secCur.discordWebhookUrl),
      rotationEndpointUrl: url(secIn.rotationEndpointUrl, secCur.rotationEndpointUrl),
      rotationEndpointToken: str(secIn.rotationEndpointToken, secCur.rotationEndpointToken, 300),
      rotationFrequencyHours: FREQUENCIES.includes(freq) ? freq : secCur.rotationFrequencyHours,
      rotationTimeUtc: time,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save radio settings error:", error);
    return NextResponse.json({ error: "Failed to save radio settings" }, { status: 500 });
  }
}
