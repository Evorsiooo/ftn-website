"use client";
export const runtime = "edge";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { IconPlayerPlay, IconTrash, IconBookmark } from "@tabler/icons-react";

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
    <div className="min-h-screen bg-neutral-950 px-6 md:px-12 py-10 space-y-8">
      {/* Header */}
      <div className="border-b border-neutral-800 pb-4">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
          Saved
        </h1>
      </div>

      {/* Grid of Saved Content */}
      {loading ? (
        <div className="text-xs text-neutral-500 py-10 text-center">Loading saved content...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
          <IconBookmark className="h-12 w-12 text-neutral-700" />
          <p className="text-neutral-400 text-sm">No saved content.</p>
          <Link
            href="/plus"
            className="text-xs font-semibold text-[#FFBB14] hover:underline"
          >
            Browse FTN+
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {items.map((item) => {
            const vidId = item.youtubeId || item.id;
            const thumb =
              item.thumbnailUrl ||
              `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`;
            const chanLink = item.channelId
              ? item.channelId.startsWith("UC")
                ? `https://www.youtube.com/channel/${item.channelId}`
                : `https://www.youtube.com/${item.channelId}`
              : `https://www.youtube.com/watch?v=${vidId}`;

            return (
              <Link
                key={item.id}
                href={`/plus/watch/${vidId}`}
                className="group relative overflow-hidden rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition duration-300 flex flex-col"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-neutral-950">
                  <img
                    src={thumb}
                    alt={item.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent opacity-80" />

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-200">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFBB14] text-black shadow-lg backdrop-blur-sm">
                      <IconPlayerPlay className="h-5 w-5 fill-current" />
                    </div>
                  </div>

                  {/* LIVE badge only */}
                  {item.isLive && (
                    <div className="absolute top-2.5 left-2.5 z-10">
                      <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                        LIVE
                      </span>
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    onClick={(e) => removeItem(item, e)}
                    title="Remove from saved"
                    className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-neutral-400 hover:text-white hover:bg-neutral-800 transition backdrop-blur-sm cursor-pointer z-20"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="p-3.5 space-y-2">
                  <div className="flex items-start gap-2.5">
                    {/* Channel Avatar Circle with Tooltip & Link */}
                    {item.channelLogoUrl ? (
                      <a
                        href={chanLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={`Visit ${item.channelTitle || "channel"}`}
                        className="relative z-10 shrink-0 mt-0.5"
                      >
                        <img
                          src={item.channelLogoUrl}
                          alt={item.channelTitle || "Channel"}
                          className="h-6 w-6 rounded-full object-cover border border-neutral-700 hover:ring-2 hover:ring-[#FFBB14] transition cursor-pointer"
                        />
                      </a>
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-neutral-800 border border-neutral-700 text-[10px] font-bold text-neutral-300 flex items-center justify-center shrink-0 mt-0.5">
                        {(item.channelTitle || item.title || "F").slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div className="space-y-0.5 flex-1 min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-neutral-200 group-hover:text-white line-clamp-2 transition-colors">
                        {item.title}
                      </h3>
                      {item.channelTitle && (
                        <p className="text-[11px] text-neutral-400 line-clamp-1">
                          {item.channelTitle}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
