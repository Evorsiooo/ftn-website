"use client";
// The Library's right-hand panel (a sheet on phones): Getting ready (Prepare), Downloads, Needs a look.
// Everything that used to stack up as notices above the song list lives here (mockup plans/library-ux/).
import React from "react";
import type { AlbumAudio, Import, Review, Song } from "./types";
import { songStatus, type RunState } from "./prepare-run";

export type ShowFilter = "all" | "on-air" | "getting-ready" | "videos" | "video-covers" | "missing" | "failed" | "archived";

/** A cover that is a frame of the YouTube video (not a square album cover). */
export const isVideoCover = (s: Pick<Song, "thumbnail">) => !!s.thumbnail && /(^https:\/\/i\d?\.ytimg\.com\/|\.ytimg\.com\/vi)/.test(s.thumbnail);

export interface OtherRun {
  id: string;
  userName: string;
  workers: number;
  total: number;
  done: number;
  failed: number;
  perMin: number | null;
  stopRequested: boolean;
}

export interface LibraryCounts {
  all: number;
  onAir: number;
  gettingReady: number;
  /** Of those getting ready, how many still need a title check (the rest only need their analysis). */
  needTitle: number;
  videos: number;
  videoCovers: number;
  missing: number;
  failed: number;
  archived: number;
}

export function countLibrary(songs: Song[]): LibraryCounts {
  const c: LibraryCounts = { all: 0, onAir: 0, gettingReady: 0, needTitle: 0, videos: 0, videoCovers: 0, missing: 0, failed: 0, archived: 0 };
  for (const s of songs) {
    const st = songStatus(s);
    if (st === "archived") {
      c.archived++;
      continue;
    }
    c.all++;
    if (st === "on-air") c.onAir++;
    else if (st === "getting-ready") {
      c.gettingReady++;
      if (!s.metaCheckedAt) c.needTitle++;
    } else if (st === "missing") c.missing++;
    else c.failed++;
    if (s.audioCheck === "unmatched") c.videos++;
    if (isVideoCover(s)) c.videoCovers++;
  }
  return c;
}

const n = (x: number) => x.toLocaleString("en-US");

/** "about 50 min", "about 1 h 20 min" (from the measured pace, so "about"). */
export function minutesLeft(left: number, perMin: number | null): string | null {
  if (!perMin || perMin <= 0) return null;
  const m = Math.max(1, Math.round(left / perMin));
  const h = Math.floor(m / 60);
  return h ? `about ${h} h${m % 60 ? ` ${m % 60} min` : ""}` : `about ${m} min`;
}

function Bar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  return (
    <div className="meter" style={{ height: 6 }} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

function Row({ dot, label, count, action }: { dot: string; label: React.ReactNode; count: number; action: React.ReactNode }) {
  return (
    <div className="ls-row">
      <span className={`dot ${dot}`} />
      <span className="ls-label">{label}</span>
      <span className="muted num">{n(count)}</span>
      {action}
    </div>
  );
}

export function LibraryStatus({
  counts,
  run,
  others,
  imports,
  reviews,
  albumAudio,
  titleCheck,
  onPrepare,
  onStop,
  onStopOther,
  onShow,
  onReview,
  onSeeImports,
  onRedownload,
  onRetry,
  busy,
}: {
  counts: LibraryCounts;
  run: RunState;
  others: OtherRun[];
  imports: Import[];
  reviews: Review[];
  albumAudio: { line: string | null };
  titleCheck: { line: string | null; running: boolean; onStop: () => void };
  onPrepare: () => void;
  onStop: () => void;
  onStopOther: (id: string) => void;
  onShow: (f: ShowFilter) => void;
  onReview: () => void;
  onSeeImports: () => void;
  onRedownload: () => void;
  onRetry: () => void;
  busy: boolean;
}) {
  const here = run.phase !== "idle";
  const elsewhere = others.filter((o) => o.id !== run.runId);
  return (
    <div className="ls">
      <h2 className="ls-title">Library status</h2>

      <section className="ls-sec">
        <h3>Getting ready</h3>
        {here ? (
          <>
            <div className="ls-big">
              <b className="num">{n(run.done)}</b>
              <span className="muted">of {n(run.total)} prepared</span>
            </div>
            <Bar value={run.done + run.failed} total={run.total} />
            <dl className="ls-facts">
              <dt>Mixing analysis</dt>
              <dd>{run.workers ? `${run.workers} at a time` : "starting"}</dd>
              {run.titleChecks && (
                <>
                  <dt>Title and cover check (new songs)</dt>
                  <dd>alongside</dd>
                </>
              )}
              <dt>Time left</dt>
              <dd>
                {run.phase === "waiting"
                  ? "waiting for the connection"
                  : minutesLeft(Math.max(0, run.total - run.done - run.failed - elsewhere.reduce((a, o) => a + o.done, 0)), (run.perMin ?? 0) + elsewhere.reduce((a, o) => a + (o.perMin ?? 0), 0) || null) ?? "measuring"}
              </dd>
              {run.failed > 0 && (
                <>
                  <dt>Couldn&apos;t be prepared</dt>
                  <dd>{n(run.failed)}</dd>
                </>
              )}
            </dl>
            <div>
              <button type="button" className="btn" onClick={onStop} disabled={run.phase === "stopping" || run.phase === "starting"}>
                {run.phase === "stopping" ? "Stopping…" : "Stop"}
              </button>
            </div>
            <p className="help ls-help">Keep this tab open. Each song goes on air as soon as it&apos;s ready. If you stop or close the tab, the next run carries on where this one ended.</p>
          </>
        ) : (
          <>
            <div className="ls-big">
              <b className="num">{n(counts.gettingReady)}</b>
              <span className="muted">{counts.gettingReady === 1 ? "song isn't on air yet" : "songs aren't on air yet"}</span>
            </div>
            <Bar value={counts.onAir} total={counts.all} />
            <p className="muted ls-p">
              {n(counts.onAir)} of {n(counts.all)} are on air. AutoDJ plays only songs that are ready.
              {counts.gettingReady > 0 && counts.needTitle === 0 && " These were already title-checked, so they only need their mixing analysis."}
            </p>
            {elsewhere.map((o) => (
              <div key={o.id} className="ls-other">
                <span className="dot amber" />
                <span className="ls-label">
                  Preparing on {o.userName}&apos;s PC: {n(o.done)} of {n(o.total)}
                  {minutesLeft(Math.max(0, o.total - o.done - o.failed), o.perMin) ? `, ${minutesLeft(Math.max(0, o.total - o.done - o.failed), o.perMin)} left` : ", measuring"}
                </span>
                <button type="button" className="btn sm" disabled={o.stopRequested} onClick={() => onStopOther(o.id)}>
                  {o.stopRequested ? "Stopping" : "Stop"}
                </button>
              </div>
            ))}
            {counts.gettingReady > 0 && (
              <>
                <div className="ls-actions">
                  <button type="button" className="btn primary" onClick={onPrepare} disabled={busy}>
                    {elsewhere.length ? "Prepare here too" : `Prepare ${n(counts.gettingReady)} ${counts.gettingReady === 1 ? "song" : "songs"}`}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => onShow("getting-ready")}>
                    Show them
                  </button>
                </div>
                <p className="help ls-help">
                  Runs in this tab, several songs at a time on your spare cores, only after you click. The time left is measured while it runs. You can stop at any time and carry on later.
                </p>
              </>
            )}
            {run.note && <p className="help ls-help">{run.note}</p>}
          </>
        )}
        {titleCheck.line && (
          <div className="ls-other">
            <span className="ls-label muted">{titleCheck.line}</span>
            {titleCheck.running && (
              <button type="button" className="btn sm" onClick={titleCheck.onStop}>
                Stop
              </button>
            )}
          </div>
        )}
      </section>

      <section className="ls-sec">
        <h3>Downloads</h3>
        {imports.length === 0 && reviews.length === 0 && !albumAudio.line ? (
          <p className="muted ls-p">Nothing downloading. Songs you add land in Getting ready.</p>
        ) : (
          <>
            {imports.map((i) => (
              <div key={i.id} className="ls-dl">
                <div className="ls-dl-line">
                  <span className="ls-label">{i.playlistName || i.title || i.url}</span>
                  {i.total ? <span className="muted num">{`${n(i.done ?? 0)} of ${n(i.total)}`}</span> : <span className="muted">starting</span>}
                </div>
                {i.total ? <Bar value={i.done ?? 0} total={i.total} /> : null}
              </div>
            ))}
            {albumAudio.line && <p className="muted ls-p">{albumAudio.line}</p>}
            {reviews.length > 0 && (
              <div className="ls-other">
                <span className="ls-label">
                  {reviews.length} {reviews.length === 1 ? "song needs" : "songs need"} your choice
                </span>
                <button type="button" className="btn" onClick={onReview}>
                  Review
                </button>
              </div>
            )}
            {imports.length > 0 && (
              <div>
                <button type="button" className="btn ghost sm" onClick={onSeeImports}>
                  See imports
                </button>
              </div>
            )}
            <p className="help ls-help">Downloaded songs land in Getting ready. Nothing here needs this tab.</p>
          </>
        )}
      </section>

      {(counts.missing > 0 || counts.failed > 0 || counts.videoCovers > 0 || counts.videos > 0 || counts.archived > 0) && (
        <section className="ls-sec">
          <h3>Needs a look</h3>
          {counts.missing > 0 && (
            <Row
              dot="red"
              label="Audio file missing"
              count={counts.missing}
              action={
                <button type="button" className="btn" disabled={busy} onClick={onRedownload}>
                  Re-download
                </button>
              }
            />
          )}
          {counts.failed > 0 && (
            <Row
              dot="red"
              label="Couldn't be prepared"
              count={counts.failed}
              action={
                <button type="button" className="btn" disabled={busy} onClick={onRetry}>
                  Try again
                </button>
              }
            />
          )}
          {counts.videoCovers > 0 && <Row dot="amber" label="Cover is a frame from the video" count={counts.videoCovers} action={<ShowBtn onClick={() => onShow("video-covers")} />} />}
          {counts.videos > 0 && <Row dot="grey" label="Kept as music videos (no album version)" count={counts.videos} action={<ShowBtn onClick={() => onShow("videos")} />} />}
          {counts.archived > 0 && <Row dot="grey" label="Archived" count={counts.archived} action={<ShowBtn onClick={() => onShow("archived")} />} />}
        </section>
      )}
    </div>
  );
}

function ShowBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn ghost ls-show" onClick={onClick}>
      Show
    </button>
  );
}
