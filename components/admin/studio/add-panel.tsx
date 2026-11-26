"use client";
// The Studio's right-hand music column: the broadcaster's own collection (grouped by the playlists they
// imported) or the AutoDJ's library, searchable, and a link box that downloads a song into the collection.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ListPlus, Plus, Search } from "lucide-react";
import { Seg } from "@/components/admin/ui";
import { MusicResults, useMusicSearch } from "@/components/admin/radio-library/add-songs";

type Song = { id?: string; key: string; title: string; artist: string; durationSec?: number; thumbnail?: string | null };
type Collection = { groups: { id: string; name: string; songs: Song[] }[]; songs: Song[]; total: number };
type Tab = "collection" | "library" | "youtube";

const PLACEHOLDER: Record<Tab, string> = { collection: "Search your collection", library: "Search the library", youtube: "Search YouTube Music" };

const dur = (s?: number) => (s && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "");
const fmtCount = new Intl.NumberFormat();

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
  return d as T;
}

function Row({ s, queued, busy, onQueue, onCollect }: { s: Song; queued: boolean; busy: boolean; onQueue: () => void; onCollect?: () => void }) {
  return (
    <div className="song">
      {s.thumbnail ? <img className="cover" src={s.thumbnail} alt="" loading="lazy" /> : <span className="cover" />}
      <span className="trunc" style={{ flex: 1 }}>
        {s.title} <span className="muted">· {s.artist}</span>
      </span>
      <span className="t12 muted num dur">{dur(s.durationSec)}</span>
      {onCollect && (
        <button type="button" className="iconbtn" aria-label={`Add ${s.title} to my collection`} onClick={onCollect}>
          <ListPlus className="ic-sm" />
        </button>
      )}
      {queued ? (
        <span className="iconbtn q-ok" title="In your queue" aria-label="In your queue">
          <Check className="ic-sm" />
        </span>
      ) : (
        <button type="button" className="iconbtn" title="Queue" aria-label={`Queue ${s.title}`} disabled={busy} onClick={onQueue}>
          <Plus className="ic-sm" />
        </button>
      )}
    </div>
  );
}

export function StudioAddPanel({
  busy,
  queuedKeys,
  readyCount,
  libraryCount,
  act,
}: {
  busy: boolean;
  /** Songs waiting in the queue (ticked instead of a + button). */
  queuedKeys: Set<string>;
  /** Queued links downloaded so far: the collection is reloaded when one arrives in it. */
  readyCount: number;
  libraryCount: number | null;
  act: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [tab, setTab] = useState<Tab>("collection");
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState<Collection | null>(null);
  const [results, setResults] = useState<Song[]>([]);
  const [url, setUrl] = useState("");
  const [autodj, setAutodj] = useState(false);
  // YouTube Music: live search on the VPS; + downloads the song into the collection and queues it
  const music = useMusicSearch(query, tab === "youtube");
  const [sent, setSent] = useState<Set<string>>(new Set());

  const loadCollection = useCallback(() => get<Collection>("/api/admin/radio/studio?collection=1").then(setCollection, () => {}), []);
  useEffect(() => {
    void loadCollection();
  }, [loadCollection, readyCount]);

  useEffect(() => {
    if (tab !== "library" || query.trim().length < 2) return setResults([]);
    const t = setTimeout(() => {
      get<{ songs: Song[] }>(`/api/admin/radio/studio?q=${encodeURIComponent(query.trim())}`).then((d) => setResults(d.songs), () => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query, tab]);

  // the collection is searched here: it's already loaded
  const shown = useMemo(() => {
    if (!collection) return null;
    const q = query.trim().toLowerCase();
    if (!q) return collection;
    const hit = (s: Song) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q);
    return { ...collection, groups: collection.groups.map((g) => ({ ...g, songs: g.songs.filter(hit) })).filter((g) => g.songs.length), songs: collection.songs.filter(hit) };
  }, [collection, query]);

  const queue = (s: Song) => void act({ op: "queueSong", key: s.key });
  // library songs not in the collection yet get a second button that puts them in it
  const mine = useMemo(() => new Set(collection ? [...collection.songs, ...collection.groups.flatMap((g) => g.songs)].map((s) => s.key) : []), [collection]);
  const collect = async (s: Song) => {
    if (!s.id) return;
    const r = await fetch("/api/admin/radio/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ songIds: [s.id] }) });
    if (r.ok) void loadCollection();
  };

  return (
    <div className="add">
      <div className="add-top">
        <Seg
          value={tab}
          onChange={setTab}
          label="Add from"
          options={[
            { value: "collection", label: "My collection", n: collection ? fmtCount.format(collection.total) : undefined },
            { value: "library", label: "Library", n: libraryCount != null ? fmtCount.format(libraryCount) : undefined },
            { value: "youtube", label: "YouTube Music" },
          ]}
        />
        <div className="search">
          <Search />
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={PLACEHOLDER[tab]}
            aria-label={PLACEHOLDER[tab]}
          />
        </div>
      </div>
      <div className="add-list">
        {tab === "collection" ? (
          shown && (
            <>
              {shown.groups.map((g) => {
                const left = g.songs.filter((s) => !queuedKeys.has(s.key));
                return (
                  <React.Fragment key={g.id}>
                    <div className="grp-h">
                      <span className="nm trunc">
                        {g.name}{" "}
                        <span className="t12 muted" style={{ fontWeight: 400 }}>
                          · {g.songs.length} {g.songs.length === 1 ? "song" : "songs"}
                        </span>
                      </span>
                      <button type="button" className="btn sm" disabled={busy || !left.length} onClick={() => void act({ op: "queueSongs", keys: left.map((s) => s.key) })}>
                        Queue all
                      </button>
                    </div>
                    {g.songs.map((s) => (
                      <Row key={s.key} s={s} queued={queuedKeys.has(s.key)} busy={busy} onQueue={() => queue(s)} />
                    ))}
                  </React.Fragment>
                );
              })}
              {shown.songs.length > 0 && (
                <>
                  {shown.groups.length > 0 && (
                    <div className="grp-h">
                      <span className="nm trunc">
                        Songs{" "}
                        <span className="t12 muted" style={{ fontWeight: 400 }}>
                          · {shown.songs.length}
                        </span>
                      </span>
                    </div>
                  )}
                  {shown.songs.map((s) => (
                    <Row key={s.key} s={s} queued={queuedKeys.has(s.key)} busy={busy} onQueue={() => queue(s)} />
                  ))}
                </>
              )}
            </>
          )
        ) : tab === "library" ? (
          results.map((s) => <Row key={s.key} s={s} queued={queuedKeys.has(s.key)} busy={busy} onQueue={() => queue(s)} onCollect={collection && !mine.has(s.key) ? () => void collect(s) : undefined} />)
        ) : query.trim().length >= 3 ? (
          <MusicResults
            compact
            results={music.results}
            loading={music.loading}
            error={music.error}
            action={(r) =>
              sent.has(r.videoId) ? (
                <span className="iconbtn q-ok" title="Downloading into your queue" aria-label="Downloading into your queue">
                  <Check className="ic-sm" />
                </span>
              ) : (
                <button
                  type="button"
                  className="iconbtn"
                  title="Queue"
                  aria-label={`Queue ${r.title}`}
                  disabled={busy}
                  onClick={() => void act({ op: "queueUrl", url: r.url, autodj }).then((ok) => ok !== false && setSent((p) => new Set(p).add(r.videoId)))}
                >
                  <Plus className="ic-sm" />
                </button>
              )
            }
          />
        ) : (
          <p className="muted" style={{ margin: 8 }}>Type an artist and a title. Songs you queue are downloaded into your collection.</p>
        )}
      </div>
      <div className="add-foot">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) void act({ op: "queueUrl", url: url.trim(), autodj }).then(() => setUrl(""));
          }}
        >
          <input className="input" style={{ flex: 1, minWidth: 0 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a YouTube, SoundCloud or Spotify link" aria-label="Song link" />
          <button type="submit" className="btn" disabled={busy || !url.trim()}>
            Queue
          </button>
        </form>
        <label className="chk">
          <input type="checkbox" className="check" checked={autodj} onChange={(e) => setAutodj(e.target.checked)} />
          Also add to the AutoDJ
        </label>
      </div>
    </div>
  );
}
