"use client";
import { Lane, MediaCard, ChannelAvatar } from "./media";
import { useContinueWatching } from "@/lib/watch-progress";
import { watchPath } from "@/lib/plus-links";

/** "Continue watching" lane; renders nothing until there is something to resume. */
export function ContinueWatching() {
  const items = useContinueWatching();
  if (items.length === 0) return null;
  return (
    <Lane title="Continue watching" cols={4}>
      {items.map((p) => {
        const left = Math.max(1, Math.round((p.duration - p.position) / 60));
        return (
          <MediaCard
            key={p.youtubeId}
            href={watchPath(p.youtubeId)}
            art={p.thumbnailUrl}
            title={p.title}
            showPlay
            progress={(p.position / p.duration) * 100}
            className="w-64 sm:w-72 md:w-80"
            lead={
              <ChannelAvatar
                logoUrl={p.channelLogoUrl}
                title={p.channelTitle}
                channelId={p.channelId}
                fallbackText={p.channelTitle}
              />
            }
          >
            <p className="text-xs text-ftn-text-3">{left} min left</p>
          </MediaCard>
        );
      })}
    </Lane>
  );
}
