"use client";
import Link from "next/link";
import { FEATURED, LANES, TRENDING, VIDEOS } from "./data";
import { M, VideoCard, byId, logo, pick, thumb } from "./cards";
import * as I from "./icons";
import { ListenButton, UseStation, useRadio } from "./shell";

const CONTINUE: [string, number][] = [
  ["Ndx1AtD_g_o", 62],
  ["-usv-d_KiN8", 18],
  ["MylfxVciOPU", 40],
  ["EUUaizbmU3k", 85],
  ["CCws1_HmR2E", 30],
  ["85QVFfO0wPM", 55],
];
const LIVE_ID = "-usv-d_KiN8";

function RadioBlock() {
  const r = useRadio();
  const s = r.station;
  if (s.mode === "offair")
    return (
      <div className="rblock">
        <Link href={`${M}/radio`} className="grow">
          <div className="t">Off air</div>
          <div className="s">{s.next}</div>
        </Link>
      </div>
    );
  return (
    <div className="rblock">
      {s.art && <img src={s.art} alt="" />}
      <Link href={`${M}/radio`} className="grow">
        <div className="t">{s.name}</div>
        <div className="s">{s.mode === "show" ? s.song : s.by}</div>
      </Link>
      <ListenButton big={false} />
    </div>
  );
}

export function HomePage({ live = false }: { live?: boolean }) {
  const f = byId.get(live ? LIVE_ID : FEATURED)!;
  const latest = VIDEOS.filter((v) => !v.live).slice(0, 6);
  return (
    <main>
      <UseStation mode="autodj" />
      <section className="hero">
        <img src={thumb(f.id, "maxresdefault")} alt="" />
        <div className="copy">
          <div className="chan">
            <img src={logo(live ? "FTN" : f.c)} alt="" />
            {live ? "FTN" : f.c}
            {live && <span className="live">LIVE</span>}
          </div>
          <h1>{live ? "Harrison Election Night" : f.t}</h1>
          {!live && f.d && <p>{f.d}</p>}
          <div className="acts">
            <Link href={`${M}/watch/${f.id}`} className="btn main lg">
              <I.Play />
              {live ? "Watch" : "Play"}
            </Link>
            {!live && (
              <button className="btn sec lg">
                <I.Save />
                Save
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="rowh">
        <h2 className="h2">Continue watching</h2>
      </div>
      <div className="cards one-row">
        {CONTINUE.map(([id, p]) => (
          <VideoCard key={id} v={byId.get(id)!} progress={p} />
        ))}
      </div>

      <div className="rowh">
        <h2 className="h2">Latest</h2>
        <Link href={`${M}/videos`}>See all</Link>
      </div>
      <div className="cards one-row">
        {latest.map((v) => (
          <VideoCard key={v.id} v={v} />
        ))}
      </div>

      <div className="rowh">
        <h2 className="h2">Radio</h2>
      </div>
      <RadioBlock />

      <div className="rowh">
        <h2 className="h2">Trending</h2>
      </div>
      <div className="cards one-row">
        {pick(TRENDING).slice(0, 6).map((v) => (
          <VideoCard key={v.id} v={v} />
        ))}
      </div>

      {LANES.map((l, i) => (
        <div key={l.title}>
          <div className="rowh">
            <h2 className="h2">{l.title}</h2>
            <Link href={`${M}/videos`}>See all</Link>
          </div>
          <div className="cards one-row" style={i === LANES.length - 1 ? { paddingBottom: 64 } : undefined}>
            {pick(l.ids).slice(0, 6).map((v) => (
              <VideoCard key={v.id} v={v} />
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}
