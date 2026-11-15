"use client";
export const runtime = "edge";
import Link from "next/link";
import { useMemo } from "react";
import { useFTNPlus } from "@/lib/ftnplus-context";
import { useContinueWatching } from "@/lib/watch-progress";
import { VideoCard, toVideo, type PlusVideo } from "@/components/plus/cards";
import { useSavedList } from "@/components/plus/saved";

/** Where you left off, and what you saved for later. */
export default function SavedPage() {
  const { allVideos } = useFTNPlus();
  const byId = useMemo(() => new Map(allVideos.map((v: any) => [v.youtubeId || v.id, v])), [allVideos]);
  const resume = useContinueWatching();
  const saved = useSavedList();
  const known = (id: string, fallback: any): PlusVideo => toVideo(byId.get(id) ?? fallback);

  if (saved === null) return <main className="page" />;
  const later = saved.map((s) => known(s.youtubeId || s.id, s));
  const empty = resume.length === 0 && later.length === 0;

  return (
    <main className="page">
      <h1 className="h1">Saved</h1>
      {empty ? (
        <div className="empty">
          <h2 className="h2">Nothing saved yet</h2>
          <div>Press Save on any video to watch it later.</div>
          <div style={{ marginTop: 20 }}>
            <Link href="/plus/videos" className="btn sec">
              Browse videos
            </Link>
          </div>
        </div>
      ) : (
        <>
          {resume.length > 0 && (
            <>
              <h2 className="h2" style={{ margin: "32px 0 16px" }}>
                Continue watching
              </h2>
              <div className="grid-v">
                {resume.map((p) => (
                  <VideoCard
                    key={p.youtubeId}
                    v={known(p.youtubeId, { youtubeId: p.youtubeId, title: p.title, thumbnailUrl: p.thumbnailUrl, channelTitle: p.channelTitle, channelLogoUrl: p.channelLogoUrl, durationSeconds: p.duration })}
                    progress={(p.position / p.duration) * 100}
                    sub={`${Math.max(1, Math.round((p.duration - p.position) / 60))} min left`}
                  />
                ))}
              </div>
            </>
          )}
          {later.length > 0 && (
            <>
              <h2 className="h2" style={{ margin: "40px 0 16px" }}>
                Watch later
              </h2>
              <div className="grid-v">
                {later.map((v) => (
                  <VideoCard key={v.id} v={v} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
