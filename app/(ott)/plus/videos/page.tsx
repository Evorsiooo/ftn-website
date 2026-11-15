"use client";
export const runtime = "edge";
import { useMemo, useState } from "react";
import { useFTNPlus } from "@/lib/ftnplus-context";
import { ChannelLogo, VideoCard, toVideo } from "@/components/plus/cards";

const PAGE = 24;

/** Every video and stream, newest first, by channel. A live stream is pinned first. */
export default function VideosPage() {
  const { allVideos, loadingLibrary } = useFTNPlus();
  const [channel, setChannel] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | "streams" | "videos">("all");
  const [sort, setSort] = useState<"new" | "old">("new");
  const [shown, setShown] = useState(PAGE);

  const all = useMemo(() => allVideos.map(toVideo), [allVideos]);
  // channels in order of how much they post, each with its logo
  const channels = useMemo(() => {
    const counts = new Map<string, { name: string; logo: string | null; n: number }>();
    for (const v of all) {
      const c = counts.get(v.channel) ?? { name: v.channel, logo: v.logo, n: 0 };
      c.n += 1;
      c.logo ??= v.logo;
      counts.set(v.channel, c);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n);
  }, [all]);
  const list = useMemo(() => {
    const l = all.filter((v) => (!channel || v.channel === channel) && (kind === "all" || (kind === "streams") === v.stream));
    l.sort((a, b) => (sort === "new" ? b.publishedAt.localeCompare(a.publishedAt) : a.publishedAt.localeCompare(b.publishedAt)));
    return [...l.filter((v) => v.live), ...l.filter((v) => !v.live)];
  }, [all, channel, kind, sort]);

  const pick = (fn: () => void) => {
    fn();
    setShown(PAGE);
  };

  return (
    <main className="page">
      <h1 className="h1">Videos</h1>
      <div className="chips" style={{ marginTop: 24 }}>
        <button className="chip" aria-pressed={!channel} onClick={() => pick(() => setChannel(null))} style={{ paddingLeft: 16 }}>
          All
        </button>
        {channels.map((c) => (
          <button key={c.name} className="chip" aria-pressed={channel === c.name} onClick={() => pick(() => setChannel(c.name))}>
            <ChannelLogo v={{ logo: c.logo, channel: c.name }} size={22} />
            {c.name}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Type">
          {(
            [
              ["all", "All"],
              ["streams", "Streams"],
              ["videos", "Videos"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} aria-pressed={kind === k} onClick={() => pick(() => setKind(k))}>
              {l}
            </button>
          ))}
        </div>
        <select className="sel" value={sort} onChange={(e) => pick(() => setSort(e.target.value as "new" | "old"))} aria-label="Sort">
          <option value="new">Newest</option>
          <option value="old">Oldest</option>
        </select>
      </div>
      {loadingLibrary ? (
        <div className="grid-v" aria-label="Loading">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i}>
              <div className="th ph-box" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="empty">Nothing here yet.</div>
      ) : (
        <div className="grid-v">
          {list.slice(0, shown).map((v) => (
            <VideoCard key={v.id} v={v} />
          ))}
        </div>
      )}
      {list.length > shown && (
        <div className="more">
          <button className="btn sec" onClick={() => setShown((s) => s + PAGE)}>
            Show more
          </button>
        </div>
      )}
    </main>
  );
}
