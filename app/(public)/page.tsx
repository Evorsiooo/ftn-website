export const runtime = "edge";
import React from "react";
import Link from "next/link";
import { DonationBanner } from "@/components/donation-banner";
import { IconPlayerPlay } from "@tabler/icons-react";
import { GsSectionHeading, GsStoryTile, type GsTone } from "@/components/gs/story";
import { getDb } from "@/db";
import { videos, siteSettings } from "@/db/schema";
import { getPublishedArticles } from "@/lib/articles";
import { syncAllConfiguredChannels, isChannelMatching } from "@/lib/youtube";
import { desc, eq } from "drizzle-orm";
import { plusHref, watchPath } from "@/lib/plus-links";

export default async function HomePage() {
  let articleList: any[] = [];
  let featuredVideo: any = null;
  let donationBannerEnabled = true;

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
          if (config.donationBannerEnabled === false) donationBannerEnabled = false;
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

  const hasStories = articleList.length > 0;
  const watchHref = featuredVideo ? plusHref(watchPath(featuredVideo.youtubeId || featuredVideo.id), "hero") : "/plus";
  const bentoStories = articleList.slice(0, 5);
  const moreStories = articleList.slice(5);
  const BENTO_TONES: GsTone[] = ["white", "gold", "dark", "white"];
  const MORE_TONES: GsTone[] = ["white", "gold", "white", "dark"];

  return (
    <div className="text-neutral-900 dark:text-white">
      {/* 1. Masthead hero: the featured FTN+ video on gold, the thumbnail breaking out of the band */}
      <section className="bg-brand text-brand-ink">
        <div className="mx-auto grid max-w-7xl items-end gap-8 px-4 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pt-16">
          <div className="pb-10 lg:pb-16">
            {featuredVideo ? (
              <>
                <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                  {featuredVideo.isLive ? (
                    <>
                      <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" /> Live now on FTN+
                    </>
                  ) : (
                    <span className="opacity-75">Latest on FTN+</span>
                  )}
                </div>
                <h1 className="text-4xl font-extrabold leading-[0.98] sm:text-5xl lg:text-6xl xl:text-7xl">{featuredVideo.title}</h1>
                {featuredVideo.description && (
                  <p className="mt-5 line-clamp-3 max-w-xl text-lg opacity-85 sm:text-xl">{featuredVideo.description}</p>
                )}
                <div className="mt-7">
                  <Link href={watchHref} className="inline-flex h-12 items-center gap-2 rounded-full bg-[#16110a] px-7 text-sm font-bold text-[#fff8e6] transition hover:bg-black">
                    <IconPlayerPlay className="h-4 w-4 fill-current" /> Watch on FTN+
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-4xl font-extrabold leading-[0.98] sm:text-5xl lg:text-7xl">Independent journalism and live district coverage.</h1>
                <p className="mt-5 max-w-xl text-lg opacity-85 sm:text-xl">
                  Investigative reporting, municipal affairs, 24/7 web radio, and digital broadcasting.
                </p>
              </>
            )}
          </div>

          {featuredVideo ? (
            <Link href={watchHref} className="group relative block overflow-hidden rounded-t-[2rem] bg-[#16110a]" aria-label={`Watch ${featuredVideo.title}`}>
              {featuredVideo.thumbnailUrl && (
                <img src={featuredVideo.thumbnailUrl} alt="" className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
              )}
              {!featuredVideo.thumbnailUrl && <div className="aspect-[16/10] w-full" />}
              <span className="absolute inset-0 flex items-center justify-center bg-black/15">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg"><IconPlayerPlay className="h-6 w-6 fill-current" /></span>
              </span>
            </Link>
          ) : (
            <div className="hidden aspect-[16/10] items-center justify-center rounded-t-[2rem] bg-[#16110a] lg:flex">
              <img src="/logos/ftn_favicon_transparent.png" alt="" className="h-24 w-auto opacity-90" />
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-14 px-4 pb-16 pt-12 sm:px-8">
        {/* 2. Latest reports: one big tile, then a mixed grid */}
        {hasStories ? (
          <section>
            <GsSectionHeading title="Latest reports" href="/articles" label="Browse all stories" />
            {bentoStories.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {bentoStories.map((story, i) => (
                  <GsStoryTile
                    key={story.id}
                    story={story}
                    tone={BENTO_TONES[i % BENTO_TONES.length]}
                    big={i === 0}
                    className={i === 0 ? "sm:col-span-2 lg:row-span-2" : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-14 text-center dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-2xl font-extrabold">No published stories yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
              Our editorial team is preparing coverage. Check back soon for the latest investigative reporting and regional news.
            </p>
          </div>
        )}

        {/* 3. More reports */}
        {moreStories.length > 0 && (
          <section>
            <GsSectionHeading title="More reports" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {moreStories.map((story, i) => (
                <GsStoryTile key={story.id} story={story} tone={MORE_TONES[i % MORE_TONES.length]} />
              ))}
            </div>
          </section>
        )}

        {/* 4. Donation appeal */}
        {donationBannerEnabled && <DonationBanner />}
      </div>
    </div>
  );
}
