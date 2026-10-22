export const runtime = "edge";
import React from "react";
import Link from "next/link";
import { BannerZone } from "@/components/ads/banner-zone";
import { IconPlayerPlay } from "@tabler/icons-react";
import { formatTimeAgo, calculateReadingTime } from "@/lib/utils";
import { Clock, Newspaper } from "lucide-react";
import { getDb } from "@/db";
import { videos, siteSettings } from "@/db/schema";
import { getPublishedArticles } from "@/lib/articles";
import { syncAllConfiguredChannels, isChannelMatching } from "@/lib/youtube";
import { desc, eq } from "drizzle-orm";
import { plusHref, watchPath } from "@/lib/plus-links";

export default async function HomePage() {
  let articleList: any[] = [];
  let featuredVideo: any = null;

  try {
    const d1 = (process.env as any).DB as D1Database;
    if (d1) {
      const db = getDb(d1);

      // Automatically sync configured YouTube channels if cooldown has passed
      try {
        await syncAllConfiguredChannels(db, { cooldownMs: 60 * 1000 });
      } catch {}

      // 1. Fetch published articles from D1 joined with author info
      articleList = await getPublishedArticles(db, { limit: 50 });

      // 2. Fetch videos for hero banner
      const rawVideos = await db
        .select()
        .from(videos)
        .orderBy(desc(videos.publishedAt));

      // Filter hidden video IDs and hidden featured channels
      let hiddenVideoIds: string[] = [];
      let hiddenFeaturedChannels: string[] = [];
      const settingsRows = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, "main_config"))
        .limit(1);

      if (settingsRows.length > 0) {
        try {
          const config = JSON.parse(settingsRows[0].valueJson);
          if (Array.isArray(config.hiddenVideoIds)) hiddenVideoIds = config.hiddenVideoIds;
          if (Array.isArray(config.hiddenFeaturedChannels)) hiddenFeaturedChannels = config.hiddenFeaturedChannels;
        } catch {}
      }

      const hiddenSet = new Set(hiddenVideoIds);
      const visibleVideos = rawVideos.filter((v) => {
        const ytid = v.youtubeId || v.id;
        return ytid && !hiddenSet.has(ytid) && !hiddenSet.has(v.id);
      });

      // Enforce strict timestamp sorting
      const sortedVisible = visibleVideos.sort((a, b) => {
        const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return timeB - timeA;
      });

      // Priority: Active live stream first, otherwise latest video published across all channels
      // Channels in hiddenFeaturedChannels are excluded from being featured
      const eligibleLives = sortedVisible.filter(
        (v) => v.isLive === true && !isChannelMatching(v, hiddenFeaturedChannels)
      );
      const eligibleVideos = sortedVisible.filter(
        (v) => !isChannelMatching(v, hiddenFeaturedChannels)
      );

      if (eligibleLives.length > 0) {
        featuredVideo = eligibleLives[0];
      } else if (eligibleVideos.length > 0) {
        featuredVideo = eligibleVideos[0];
      }
    }
  } catch (err) {
    console.error("Error fetching homepage data:", err);
  }

  const leadStory = articleList[0] || null;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-black dark:text-white relative">
      {/* 1. Featured Broadcast Showcase Banner */}
      <section className="relative w-full overflow-hidden bg-neutral-900 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800">
        {featuredVideo ? (
          <div className="relative w-full min-h-[500px] sm:min-h-[560px] flex items-end">
            {/* High-res backdrop thumbnail */}
            <img
              src={
                featuredVideo.thumbnailUrl ||
                "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1800&auto=format&fit=crop&q=80"
              }
              alt={featuredVideo.title}
              className="absolute inset-0 w-full h-full object-cover object-center filter brightness-[0.75]"
            />
            {/* Refined, smooth cinematic gradient without muddy seams or weird splotches */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />

            <div className="relative z-10 container mx-auto max-w-7xl px-4 sm:px-8 pt-28 sm:pt-36 pb-12 sm:pb-16 space-y-4">
              {/* Only show LIVE badge if streaming */}
              {featuredVideo.isLive && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-red-600 text-white text-[11px] font-black uppercase tracking-wider shadow-sm animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-white" />
                    LIVE NOW
                  </span>
                </div>
              )}

              {/* Title */}
              <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-white max-w-3xl leading-[1.15] drop-shadow-md">
                {featuredVideo.title}
              </h1>

              {/* Description */}
              {featuredVideo.description && (
                <p className="text-xs sm:text-sm md:text-base text-neutral-200 line-clamp-2 sm:line-clamp-3 max-w-2xl leading-relaxed drop-shadow">
                  {featuredVideo.description}
                </p>
              )}

              {/* Action Button */}
              <div className="pt-2">
                <Link href={plusHref(watchPath(featuredVideo.youtubeId || featuredVideo.id), "hero")}>
                  <button className="gap-2.5 font-black px-7 h-12 text-xs sm:text-sm rounded-xl bg-[#FFBB14] hover:bg-[#e5a710] text-black shadow-[0px_2px_0px_0px_#FFFFFF40_inset] flex items-center justify-center transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer">
                    <IconPlayerPlay className="h-4 w-4 fill-current" /> Watch on FTN+
                  </button>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* Clean Minimal Hero when loading or library has no videos yet */
          <div className="relative w-full min-h-[500px] sm:min-h-[560px] pt-28 sm:pt-36 pb-12 sm:pb-16 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black flex items-end">
            <div className="container mx-auto max-w-7xl px-4 sm:px-8 space-y-4">
              <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-white max-w-3xl leading-[1.15]">
                Independent Journalism & Live District Coverage
              </h1>
              <p className="text-xs sm:text-sm md:text-base text-neutral-300 max-w-xl leading-relaxed">
                Investigative reporting, municipal affairs, 24/7 web radio, and digital broadcasting.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Main Container */}
      <div className="container mx-auto max-w-7xl px-4 sm:px-8 py-8 space-y-12 relative z-10">
        {/* Top Header Leaderboard Ad */}
        <BannerZone zone="header_leaderboard" format="1024x180" className="w-full" />

        {/* 2. Editorial News Grid - Shows all articles under Latest Reports */}
        {leadStory ? (
          <section className="space-y-8">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h2 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
                <Newspaper className="h-6 w-6 text-blue-600 dark:text-blue-400" /> Latest Reports
              </h2>
              <Link
                href="/articles"
                className="text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition"
              >
                Browse All Stories →
              </Link>
            </div>

            {/* Main Lead Story (Top / Featured) */}
            <div className="w-full">
              <Link
                href={`/articles/${leadStory.slug}`}
                className="group block rounded-2xl border border-neutral-200 bg-white p-5 sm:p-7 hover:border-neutral-300 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700 dark:shadow-none transition"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
                  {leadStory.coverImageUrl && (
                    <div className="lg:col-span-7 h-64 sm:h-96 w-full overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-900">
                      <img
                        src={leadStory.coverImageUrl}
                        alt={leadStory.title}
                        className="h-full w-full object-cover group-hover:scale-105 transition duration-500"
                      />
                    </div>
                  )}

                  <div className={`${leadStory.coverImageUrl ? "lg:col-span-5" : "lg:col-span-12"} space-y-3.5`}>
                    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                      <span className="uppercase font-mono text-[#00a9d2] font-bold">
                        {leadStory.category}
                      </span>
                      <span>•</span>
                      <span>{formatTimeAgo(leadStory.publishedAt || leadStory.createdAt)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-medium">
                        <Clock className="h-3 w-3" />
                        {calculateReadingTime(leadStory.content)}
                      </span>
                    </div>

                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-neutral-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition leading-tight">
                      {leadStory.title}
                    </h2>

                    <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 line-clamp-3 leading-relaxed">
                      {leadStory.summary}
                    </p>

                    <div className="flex items-center gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-900 text-xs text-neutral-500 dark:text-neutral-400">
                      {leadStory.authorAvatar && (
                        <img
                          src={leadStory.authorAvatar}
                          alt=""
                          className="h-5 w-5 rounded-full object-cover"
                        />
                      )}
                      <span>
                        By{" "}
                        <strong className="text-neutral-800 dark:text-neutral-200">
                          {leadStory.authorUsername || leadStory.authorName || "FTN Editorial"}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>

            {/* All Remaining Articles (Grid directly below the main latest article) */}
            {articleList.length > 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                {articleList.slice(1).map((story) => (
                  <Link
                    key={story.id}
                    href={`/articles/${story.slug}`}
                    className="group rounded-2xl border border-neutral-200 bg-white overflow-hidden flex flex-col justify-between hover:border-neutral-300 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700 dark:shadow-none transition"
                  >
                    {story.coverImageUrl && (
                      <div className="h-48 w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900">
                        <img
                          src={story.coverImageUrl}
                          alt={story.title}
                          className="h-full w-full object-cover group-hover:scale-105 transition duration-500"
                        />
                      </div>
                    )}

                    <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                          <span className="uppercase font-mono text-[#00a9d2] font-bold">
                            {story.category}
                          </span>
                          <span>•</span>
                          <span>{formatTimeAgo(story.publishedAt || story.createdAt)}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-medium">
                            <Clock className="h-3 w-3" />
                            {calculateReadingTime(story.content)}
                          </span>
                        </div>

                        <h3 className="font-bold text-base sm:text-lg text-neutral-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition leading-snug">
                          {story.title}
                        </h3>

                        <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                          {story.summary}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-900 text-xs text-neutral-500 dark:text-neutral-400 mt-3">
                        {story.authorAvatar && (
                          <img
                            src={story.authorAvatar}
                            alt=""
                            className="h-4 w-4 rounded-full object-cover"
                          />
                        )}
                        <span>
                          By{" "}
                          <strong className="text-neutral-800 dark:text-neutral-200">
                            {story.authorUsername || story.authorName || "FTN Editorial"}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="p-16 text-center rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 space-y-3 shadow-sm dark:shadow-none">
            <Newspaper className="h-10 w-10 text-neutral-400 dark:text-neutral-600 mx-auto" />
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">No Published Stories Yet</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
              Our editorial team is preparing coverage. Check back soon for the latest investigative reporting and regional news.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
