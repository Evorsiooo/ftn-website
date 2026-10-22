import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { siteSettings, videos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifySessionToken } from "@/lib/auth";
import { canConfigureSite } from "@/lib/rbac";

export const runtime = "edge";

export interface CustomSwimlaneConfig {
  id: string;
  title: string;
  channelIds?: string[];
  regexPattern?: string;
  sortBy: "recent" | "trending";
}

export interface SocialLinkConfig {
  id: string;
  name: string;
  url: string;
}

export interface SiteConfig {
  streamUrl: string;
  statusJson: string;
  webradioEnabled: boolean;
  allowSignIn: boolean;
  authMode: "roblox" | "credentials";
  discordUrl: string;
  youtubeChannels: string[];
  bannedWords: string;
  ftnPlusAccess: "public" | "members_only";
  tiplineAccess: "public" | "members_only";
  socialLinks: SocialLinkConfig[];
  customSwimlanes: CustomSwimlaneConfig[];
  hiddenVideoIds: string[];
  hiddenFeaturedChannels?: string[];
  hiddenTrendingChannels?: string[];
  donationBannerEnabled: boolean;
  autoModEnabled: boolean;
  autoModThreshold: number;
  autoModMuteDuration: "24h" | "1w" | "1m" | "indefinite";
}

const DEFAULT_CONFIG: SiteConfig = {
  streamUrl: "https://icecast.ftnmedia.org/live.mp3",
  statusJson: "https://icecast.ftnmedia.org/status-json.xsl",
  webradioEnabled: true,
  allowSignIn: true,
  authMode: "roblox",
  discordUrl: "https://discord.gg/ftn",
  youtubeChannels: [],
  hiddenFeaturedChannels: [],
  hiddenTrendingChannels: [],
  bannedWords: "fuck\nshit\nbitch\nasshole\ncunt\ndick\npussy\nnigger\nfaggot",
  ftnPlusAccess: "public",
  tiplineAccess: "public",
  socialLinks: [
    { id: "sl-discord", name: "Discord Server", url: "https://discord.gg/ftn" },
    { id: "sl-roblox", name: "Roblox Group", url: "https://www.roblox.com" },
    { id: "sl-youtube", name: "YouTube Channel", url: "https://www.youtube.com" },
  ],
  customSwimlanes: [
    {
      id: "sl-broadcasts",
      title: "Special Broadcasts & Reports",
      regexPattern: "report|broadcast|governance|special",
      sortBy: "recent",
    },
    {
      id: "sl-sports",
      title: "Sports & Racing Highlights",
      regexPattern: "championship|race|cup|match|sports",
      sortBy: "trending",
    },
  ],
  hiddenVideoIds: [],
  donationBannerEnabled: true,
  autoModEnabled: true,
  autoModThreshold: 3,
  autoModMuteDuration: "24h",
};

let inMemoryConfig: SiteConfig = { ...DEFAULT_CONFIG };

export async function GET() {
  const d1 = (process.env as any).DB as D1Database;
  if (d1) {
    try {
      const db = getDb(d1);
      const rows = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, "main_config"))
        .limit(1);

      if (rows.length > 0) {
        const stored = JSON.parse(rows[0].valueJson);
        inMemoryConfig = { ...DEFAULT_CONFIG, ...stored };
      }
    } catch {}
  }
  return NextResponse.json(inMemoryConfig, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cookieToken = req.headers.get("cookie")?.split("; ").find((r) => r.startsWith("ftn_session="))?.split("=")[1];
    const token = authHeader?.replace("Bearer ", "") || cookieToken;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || !canConfigureSite(user.roles)) {
      return NextResponse.json({ error: "Forbidden: Administrator role required" }, { status: 403 });
    }

    const body = (await req.json()) as any;
    const d1 = (process.env as any).DB as D1Database;

    // Support deleting / hiding a specific video from FTN+
    if (body.action === "delete_video" && body.videoId) {
      if (d1) {
        const db = getDb(d1);
        await db.delete(videos).where(eq(videos.youtubeId, body.videoId));
        await db.delete(videos).where(eq(videos.id, body.videoId));
      }
      return NextResponse.json({ success: true, message: `Video ${body.videoId} removed from database.` });
    }
    
    // Support purging old dummy/boilerplate videos if requested
    if (body.action === "purge_dummy_videos") {
      if (d1) {
        const db = getDb(d1);
        const dummyIds = ["dQw4w9WgXcQ", "9bZkp7q19f0", "kJQP7kiw5Fk", "fJ9rUzIMcZQ", "L_LUpnjgPso", "3JZ_D3ELwOQ", "2Vv-BfVoq4g", "RgKAFK5djSk", "e-ORhEE9VVg", "kXYiU_JCYtU"];
        for (const dummyId of dummyIds) {
          await db.delete(videos).where(eq(videos.youtubeId, dummyId));
        }
      }
      return NextResponse.json({ success: true, message: "Boilerplate demo videos purged." });
    }

    // Merge and sanitize new config with existing
    const updatedConfig: SiteConfig = {
      ...inMemoryConfig,
      streamUrl: typeof body.streamUrl === "string" ? body.streamUrl.trim().slice(0, 500) : inMemoryConfig.streamUrl,
      statusJson: typeof body.statusJson === "string" ? body.statusJson.trim().slice(0, 500) : inMemoryConfig.statusJson,
      webradioEnabled: typeof body.webradioEnabled === "boolean" ? body.webradioEnabled : inMemoryConfig.webradioEnabled,
      allowSignIn: typeof body.allowSignIn === "boolean" ? body.allowSignIn : inMemoryConfig.allowSignIn,
      authMode: body.authMode === "credentials" ? "credentials" : "roblox",
      discordUrl: typeof body.discordUrl === "string" ? body.discordUrl.trim().slice(0, 500) : inMemoryConfig.discordUrl,
      youtubeChannels: Array.isArray(body.youtubeChannels)
        ? body.youtubeChannels.filter((c: any) => typeof c === "string" && c.trim()).map((c: string) => c.trim().slice(0, 100))
        : inMemoryConfig.youtubeChannels,
      bannedWords: typeof body.bannedWords === "string" ? body.bannedWords.slice(0, 50000) : inMemoryConfig.bannedWords,
      ftnPlusAccess: body.ftnPlusAccess === "members_only" ? "members_only" : "public",
      tiplineAccess: body.tiplineAccess === "members_only" ? "members_only" : "public",
      socialLinks: Array.isArray(body.socialLinks) ? body.socialLinks.slice(0, 20) : inMemoryConfig.socialLinks,
      customSwimlanes: Array.isArray(body.customSwimlanes) ? body.customSwimlanes.slice(0, 50) : inMemoryConfig.customSwimlanes,
      hiddenVideoIds: Array.isArray(body.hiddenVideoIds) ? body.hiddenVideoIds.filter((id: any) => typeof id === "string" && id.trim()).map((id: string) => id.trim()) : inMemoryConfig.hiddenVideoIds || [],
      hiddenFeaturedChannels: Array.isArray(body.hiddenFeaturedChannels)
        ? body.hiddenFeaturedChannels.filter((c: any) => typeof c === "string" && c.trim()).map((c: string) => c.trim().slice(0, 100))
        : inMemoryConfig.hiddenFeaturedChannels || [],
      hiddenTrendingChannels: Array.isArray(body.hiddenTrendingChannels)
        ? body.hiddenTrendingChannels.filter((c: any) => typeof c === "string" && c.trim()).map((c: string) => c.trim().slice(0, 100))
        : inMemoryConfig.hiddenTrendingChannels || [],
      donationBannerEnabled: typeof body.donationBannerEnabled === "boolean" ? body.donationBannerEnabled : inMemoryConfig.donationBannerEnabled,
      autoModEnabled: typeof body.autoModEnabled === "boolean" ? body.autoModEnabled : inMemoryConfig.autoModEnabled,
      autoModThreshold: typeof body.autoModThreshold === "number" ? Math.min(20, Math.max(1, body.autoModThreshold)) : inMemoryConfig.autoModThreshold,
      autoModMuteDuration: ["24h", "1w", "1m", "indefinite"].includes(body.autoModMuteDuration) ? body.autoModMuteDuration : inMemoryConfig.autoModMuteDuration,
    };

    // Server-side guarantee: Password / Username Mode always locks Account Creation to DISABLED
    if (updatedConfig.authMode === "credentials") {
      updatedConfig.allowSignIn = false;
    }

    inMemoryConfig = updatedConfig;

    if (d1) {
      const db = getDb(d1);
      const rows = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, "main_config"))
        .limit(1);

      const serialized = JSON.stringify(updatedConfig);

      if (rows.length > 0) {
        await db
          .update(siteSettings)
          .set({
            valueJson: serialized,
            updatedAt: new Date(),
          })
          .where(eq(siteSettings.key, "main_config"));
      } else {
        await db.insert(siteSettings).values({
          key: "main_config",
          valueJson: serialized,
          updatedAt: new Date(),
        });
      }

      // Also persist general settings row for fast auth mode lookups
      const generalRow = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, "general"))
        .limit(1);

      const generalSerialized = JSON.stringify({
        allowSignIn: updatedConfig.allowSignIn,
        authMode: updatedConfig.authMode,
      });

      if (generalRow.length > 0) {
        await db
          .update(siteSettings)
          .set({
            valueJson: generalSerialized,
            updatedAt: new Date(),
          })
          .where(eq(siteSettings.key, "general"));
      } else {
        await db.insert(siteSettings).values({
          key: "general",
          valueJson: generalSerialized,
          updatedAt: new Date(),
        });
      }
    }

    return NextResponse.json({ success: true, config: updatedConfig });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update configuration" }, { status: 400 });
  }
}
