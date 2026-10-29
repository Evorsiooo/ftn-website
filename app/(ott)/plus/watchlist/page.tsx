"use client";
export const runtime = "edge";
import React, { useState, useEffect } from "react";
import { IconTrash, IconBookmark } from "@tabler/icons-react";
import { PageShell, PageHeader } from "@/components/ftn/page";
import { Button, EmptyState, GUTTER, Skeleton } from "@/components/ftn/ui";
import { MediaCard, ChannelAvatar } from "@/components/ftn/media";
import { watchPath } from "@/lib/plus-links";

export default function WatchlistPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Try fetching from backend authenticated watchlist
    fetch("/api/plus/watchlist")
      .then((res) => res.json())
      .then((data: any) => {
        if (data && Array.isArray(data.watchlist) && data.watchlist.length > 0) {
          setItems(data.watchlist);
          setLoading(false);
          return;
        }
        // Fallback to localStorage
        loadFromLocalStorage();
      })
      .catch(() => {
        loadFromLocalStorage();
      })
      .finally(() => setLoading(false));
  }, []);

  const loadFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem("ftn_watchlist");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setItems(parsed);
          return;
        }
      }
    } catch (e) {
      console.error(e);
    }
    setItems([]);
  };

  const removeItem = (item: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const targetVidId = item.youtubeId || item.videoId || item.id;
    const updated = items.filter(
      (i) =>
        i.id !== item.id &&
        i.youtubeId !== item.youtubeId &&
        (!item.videoId || i.videoId !== item.videoId)
    );
    setItems(updated);

    try {
      localStorage.setItem("ftn_watchlist", JSON.stringify(updated));
    } catch (err) {
      console.error(err);
    }

    // Explicitly remove from backend database
    fetch("/api/plus/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: targetVidId, action: "remove" }),
    }).catch(() => {});
  };

  return (
    <PageShell>
      <PageHeader title="Saved" subtitle="Videos you've bookmarked to watch later." />

      <div className={GUTTER}>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<IconBookmark />}
            title="Nothing saved yet"
            description="Tap the bookmark on any video and it will show up here."
            action={<Button href="/plus">Browse FTN+</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {items.map((item) => {
              const vidId = item.youtubeId || item.id;
              return (
                <MediaCard
                  key={item.id}
                  href={watchPath(vidId)}
                  art={item.thumbnailUrl || `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`}
                  title={item.title}
                  live={item.isLive}
                  showPlay
                  className="w-full"
                  corner={
                    <button
                      onClick={(e) => removeItem(item, e)}
                      title="Remove from saved"
                      aria-label="Remove from saved"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-ftn-text-2 hover:text-white hover:bg-black/90 transition backdrop-blur-sm cursor-pointer"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  }
                  lead={
                    <ChannelAvatar
                      logoUrl={item.channelLogoUrl}
                      title={item.channelTitle}
                      channelId={item.channelId}
                      fallbackText={item.channelTitle || item.title}
                    />
                  }
                >
                  {item.channelTitle && <p className="text-xs text-ftn-text-3 line-clamp-1">{item.channelTitle}</p>}
                </MediaCard>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
