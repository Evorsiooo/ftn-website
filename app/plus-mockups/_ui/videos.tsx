"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LOGOS, TRENDING, VIDEOS } from "./data";
import { M, MiniCard, VideoCard, ago, byId, logo, pick, thumb } from "./cards";
import * as I from "./icons";
import { UseStation, useRadio } from "./shell";

const CHANNELS = ["FTN", "H-SPAN", "R-SPAN", "The Jamestown Times", "kiricounty", "Euno", "FlyingSandwich"];
const LIVE_ID = "-usv-d_KiN8";

export function VideosPage({ live = false }: { live?: boolean }) {
  const [channel, setChannel] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | "streams" | "videos">("all");
  const [sort, setSort] = useState("new");
  const [shown, setShown] = useState(24);
  const list = useMemo(() => {
    let l = VIDEOS.filter((v) => (!channel || v.c === channel) && (kind === "all" || (kind === "streams") === v.live));
    l = [...l].sort((a, b) => (sort === "new" ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)));
    if (live && (!channel || channel === "FTN") && kind !== "videos") l = [byId.get(LIVE_ID)!, ...l.filter((v) => v.id !== LIVE_ID)];
    return l;
  }, [channel, kind, sort, live]);
  return (
    <main className="page">
      <UseStation mode="autodj" />
      <h1 className="h1">Videos</h1>
      <div className="chips" style={{ marginTop: 24 }}>
        <button className="chip" aria-pressed={!channel} onClick={() => setChannel(null)} style={{ paddingLeft: 16 }}>
          All
        </button>
        {CHANNELS.map((c) => (
          <button key={c} className="chip" aria-pressed={channel === c} onClick={() => setChannel(c)}>
            <img src={LOGOS[c]} alt="" />
            {c}
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
            <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {l}
            </button>
          ))}
        </div>
        <select className="sel" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="new">Newest</option>
          <option value="old">Oldest</option>
        </select>
      </div>
      <div className="grid-v">
        {list.slice(0, shown).map((v, i) =>
          live && i === 0 && v.id === LIVE_ID ? (
            <VideoCard key="live" v={{ ...v, t: "Harrison Election Night" }} live sub="started 20 minutes ago" />
          ) : (
            <VideoCard key={v.id + i} v={v} />
          ),
        )}
      </div>
      {list.length > shown && (
        <div className="more">
          <button className="btn sec" onClick={() => setShown((s) => s + 24)}>
            Show more
          </button>
        </div>
      )}
    </main>
  );
}

export function WatchPage({ id }: { id: string }) {
  const v = byId.get(id) ?? byId.get("zcmpUBqBSl0")!;
  const r = useRadio();
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  // The radio keeps playing under the video, lowered, and comes back up when the video stops.
  useEffect(() => {
    r.setDucked(playing);
    return () => r.setDucked(false);
     
  }, [playing]);
  useEffect(() => {
    if (window.location.hash === "#playing") setPlaying(true);
  }, []);
  const more = VIDEOS.filter((x) => x.c === v.c && x.id !== v.id).slice(0, 4);
  const trending = pick(TRENDING).filter((x) => x.id !== v.id).slice(0, 6);
  const longDesc = v.d.length > 160;
  return (
    <main className="watch">
      <UseStation mode="autodj" />
      <div>
        <div className="player">
          {playing ? (
            // The real YouTube player, with its own controls, as on the live page.
            <>
              <img src={thumb(v.id, "maxresdefault")} alt="" />
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`}
                title={v.t}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </>
          ) : (
            <>
              <img src={thumb(v.id, "maxresdefault")} alt="" />
              <button className="go" aria-label="Play" onClick={() => setPlaying(true)}>
                <span>
                  <I.Play />
                </span>
              </button>
            </>
          )}
        </div>
        <h1>{v.t}</h1>
        <div className="wrow">
          <div className="chan">
            <img src={logo(v.c)} alt="" style={{ width: 40, height: 40 }} />
            <div>
              <div>{v.c}</div>
              <div className="s">
                {v.live ? "Streamed" : "Uploaded"} {ago(v.at)}
              </div>
            </div>
          </div>
          <div className="acts">
            <button className="btn sec sm" aria-pressed={saved} onClick={() => setSaved((s) => !s)}>
              {saved ? <I.Saved /> : <I.Save />}
              {saved ? "Saved" : "Save"}
            </button>
            <button className="btn sec sm">
              <I.Share />
              Share
            </button>
          </div>
        </div>
        {v.d && (
          <div className="desc">
            {open || !longDesc ? v.d : v.d.slice(0, 160).trimEnd() + "…"}
            {longDesc && (
              <div>
                <button onClick={() => setOpen((o) => !o)}>{open ? "Less" : "More"}</button>
              </div>
            )}
          </div>
        )}
      </div>
      <aside className="side">
        {more.length > 0 && (
          <>
            <h2 className="h2">More from {v.c}</h2>
            {more.map((x) => (
              <MiniCard key={x.id} v={x} />
            ))}
          </>
        )}
        <h2 className="h2">Trending</h2>
        {trending.map((x) => (
          <MiniCard key={x.id} v={x} />
        ))}
      </aside>
    </main>
  );
}

const SAVED_CONTINUE: [string, number][] = [
  ["Ndx1AtD_g_o", 62],
  ["-usv-d_KiN8", 18],
  ["MylfxVciOPU", 40],
];
const LATER = ["UXHz3BoL_go", "mWPj258ghcM", "zq-vN1aKtFY", "tL5UVHUuu7Y", "CCws1_HmR2E"];

export function SavedPage({ empty = false }: { empty?: boolean }) {
  return (
    <main className="page">
      <UseStation mode="autodj" />
      <h1 className="h1">Saved</h1>
      {empty ? (
        <div className="empty">
          <h2 className="h2">Nothing saved yet</h2>
          <div>Press Save on any video to watch it later.</div>
          <div style={{ marginTop: 20 }}>
            <Link href={`${M}/videos`} className="btn sec">
              Browse videos
            </Link>
          </div>
        </div>
      ) : (
        <>
          <h2 className="h2" style={{ margin: "32px 0 16px" }}>
            Continue watching
          </h2>
          <div className="grid-v">
            {SAVED_CONTINUE.map(([id, p]) => (
              <VideoCard key={id} v={byId.get(id)!} progress={p} />
            ))}
          </div>
          <h2 className="h2" style={{ margin: "40px 0 16px" }}>
            Watch later
          </h2>
          <div className="grid-v">
            {pick(LATER).map((v) => (
              <VideoCard key={v.id} v={v} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
