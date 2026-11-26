"use client";
// Library › Collections: the songs broadcasters added, grouped by the playlists they imported. Each song can be
// put on the AutoDJ or taken off it, or taken out of the collection. Yours only, unless you're a site admin or
// manager (then anyone's).
import React, { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Switch } from "@/components/admin/ui";
import { confirmDialog, toast } from "@/components/gs/dialogs";
import { api, duration } from "./types";

type Song = { id: string; key: string; title: string; artist: string; durationSec: number; thumbnail: string | null; autodj: boolean };
type Collection = { userId: string; groups: { id: string; name: string; songs: Song[] }[]; songs: Song[]; total: number };
type Owner = { userId: string; name: string; avatar: string | null; count: number };

const n = new Intl.NumberFormat();

export function Collections({ onCount, onChanged }: { onCount: (n: number) => void; onChanged: () => void }) {
  const [owners, setOwners] = useState<Owner[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [data, setData] = useState<Collection | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<{ owners: Owner[]; me: string }>("/api/admin/radio/collections?owners=1").then(
      (d) => {
        setOwners(d.owners);
        setMe(d.me);
        onCount(d.owners.length);
        setWho((w) => w ?? d.me);
      },
      (e) => toast(e.message)
    );
  }, [onCount]);

  const load = useCallback(() => {
    if (!who) return;
    api<Collection>(`/api/admin/radio/collections${who === me ? "" : `?user=${encodeURIComponent(who)}`}`).then(setData, (e) => toast(e.message));
  }, [who, me]);
  useEffect(load, [load]);

  const patch = (s: Song, autodj: boolean) => {
    setBusy(s.id);
    api(`/api/admin/radio/songs/${s.id}`, { method: "PATCH", body: JSON.stringify({ autodj }) })
      .then(() => {
        const set = (list: Song[]) => list.map((x) => (x.id === s.id ? { ...x, autodj } : x));
        setData((d) => d && { ...d, songs: set(d.songs), groups: d.groups.map((g) => ({ ...g, songs: set(g.songs) })) });
        onChanged();
      }, (e) => toast(e.message))
      .finally(() => setBusy(null));
  };
  const remove = async (s: Song) => {
    if (!(await confirmDialog(`Take “${s.title}” out of this collection?`, { ok: "Remove" }))) return;
    setBusy(s.id);
    api("/api/admin/radio/collections", { method: "DELETE", body: JSON.stringify({ songId: s.id, userId: who }) })
      .then(() => {
        load();
        onChanged();
      }, (e) => toast(e.message))
      .finally(() => setBusy(null));
  };

  const others = (owners ?? []).filter((o) => o.userId !== me);
  const row = (s: Song) => (
    <div key={s.id} className="r">
      {s.thumbnail ? <img className="coll-cover" src={s.thumbnail} alt="" loading="lazy" /> : <span className="coll-cover" />}
      <div className="grow trunc">
        {s.title} <span className="muted">· {s.artist}</span>
      </div>
      <span className="t12 muted num">{duration(s.durationSec)}</span>
      <label className="t12 muted coll-dj">
        AutoDJ
        <Switch checked={s.autodj} disabled={busy === s.id} onChange={(v) => patch(s, v)} label={`Play ${s.title} on the AutoDJ`} />
      </label>
      <button type="button" className="iconbtn" aria-label={`Remove ${s.title}`} disabled={busy === s.id} onClick={() => void remove(s)}>
        <Trash2 className="ic-sm" />
      </button>
    </div>
  );

  return (
    <div className="coll adm-scroll">
      {others.length > 0 && (
        <select className="select sm" value={who ?? ""} onChange={(e) => setWho(e.target.value)} aria-label="Whose collection">
          {me && !owners?.some((o) => o.userId === me) && <option value={me}>Mine (0)</option>}
          {(owners ?? []).map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.userId === me ? "Mine" : o.name} ({n.format(o.count)})
            </option>
          ))}
        </select>
      )}
      {!data ? null : data.total === 0 ? (
        <div className="empty">{data.userId === me ? "Your collection is empty." : "This collection is empty."}</div>
      ) : (
        <>
          {data.groups.map((g) => (
            <section key={g.id}>
              <h2 className="coll-h">
                {g.name} <span className="t12 muted">· {g.songs.length} {g.songs.length === 1 ? "song" : "songs"}</span>
              </h2>
              <div className="rows">{g.songs.map(row)}</div>
            </section>
          ))}
          {data.songs.length > 0 && (
            <section>
              {data.groups.length > 0 && (
                <h2 className="coll-h">
                  Songs <span className="t12 muted">· {data.songs.length}</span>
                </h2>
              )}
              <div className="rows">{data.songs.map(row)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
