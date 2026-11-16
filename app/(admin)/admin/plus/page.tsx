"use client";
import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, ListVideo, Loader2, Pencil, Plus, RefreshCw, Search, Sliders, Trash2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { confirmDialog } from "@/components/gs/dialogs";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { Body, Field, PageBar, Pill, SaveBar, Screen, Section, Seg, Sheet, Switch } from "@/components/admin/ui";
import { useSiteConfig, type CustomSwimlane, type PlaylistVideo, type SiteConfig } from "@/components/admin/settings/use-site-config";
import { canConfigureSite } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type Tab = "channels" | "videos" | "rows";
const TAB_SECTIONS: Record<Tab, string[]> = { channels: ["channels", "twitch"], videos: ["catalog"], rows: ["swimlanes"] };
const SORT_LABEL: Record<string, string> = { recent: "Newest first", trending: "Most watched this week", curated: "In the order added" };

function PlusContentPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = (["channels", "videos", "rows"] as const).find((t) => t === params.get("tab")) ?? "channels";
  const setTab = (t: Tab) => router.replace(t === "channels" ? "/admin/plus" : `/admin/plus?tab=${t}`, { scroll: false });
  const c = useSiteConfig({ videos: tab === "videos" });

  const mine = TAB_SECTIONS[tab];
  const dirtyHere = c.dirtySections.filter((id) => mine.includes(id));
  const anyDirty = (t: Tab) => c.dirtySections.some((id) => TAB_SECTIONS[t].includes(id));

  const tabs = [
    { value: "channels" as const, label: anyDirty("channels") ? "Channels •" : "Channels", n: c.youtubeChannels.length + c.twitchChannels.length },
    { value: "videos" as const, label: anyDirty("videos") ? "Videos •" : "Videos", n: c.videosLoaded ? c.ingestedVideos.length : undefined },
    { value: "rows" as const, label: anyDirty("rows") ? "Rows •" : "Rows", n: c.swimlanes.length },
  ];

  return (
    <Screen>
      <PageBar
        title="FTN+ content"
        tools={<Seg value={tab} onChange={setTab} options={tabs} label="Show" />}
        end={
          tab === "channels" ? (
            <button type="button" className="btn has-lbl-m" onClick={c.handleTriggerSync} disabled={c.isSyncingVideos} aria-label="Sync videos now">
              <RefreshCw className={cn("ic", c.isSyncingVideos && "spin")} />
              <span className="lbl-m">{c.isSyncingVideos ? "Syncing…" : "Sync videos now"}</span>
            </button>
          ) : tab === "rows" ? (
            <button type="button" className="btn primary has-lbl-m" onClick={() => c.setNewSwimlaneOpen(true)} aria-label="New row">
              <Plus className="ic" />
              <span className="lbl-m">New row</span>
            </button>
          ) : null
        }
        mrow={<Seg value={tab} onChange={setTab} options={tabs.map((t) => ({ value: t.value, label: t.label }))} label="Show" />}
      />
      {c.syncStatus && (
        <div className="notice" role="status">
          <RefreshCw className={cn("ic-sm", c.isSyncingVideos && "spin")} />
          <span style={{ flex: 1, minWidth: 0 }}>{c.syncStatus}</span>
          <button type="button" className="btn sm ghost" onClick={() => c.setSyncStatus(null)}>
            Close
          </button>
        </div>
      )}
      <Body scroll>
        {!c.configLoaded ? <div className="empty">Loading…</div> : tab === "channels" ? <ChannelsTab c={c} /> : tab === "videos" ? <VideosTab c={c} /> : <RowsTab c={c} />}
      </Body>
      <SaveBar
        dirty={dirtyHere.length > 0}
        changed={dirtyHere.map((id) => c.SECTIONS[id].label)}
        saving={c.savingSection !== null}
        saved={c.savedSuccess}
        onSave={() => void c.saveMany(dirtyHere)}
        onDiscard={() => dirtyHere.forEach((id) => c.revertSection(id))}
      />
    </Screen>
  );
}

/* ---------------- Channels ---------------- */

function ChannelsTab({ c }: { c: SiteConfig }) {
  return (
    <div className="formcol" style={{ margin: "0 auto" }}>
      <Section title="YouTube channels" desc="FTN+ brings in the videos of these channels. Choose where each one may appear.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            c.handleAddChannel(e);
          }}
          style={{ display: "flex", gap: 8 }}
        >
          <input className="input" style={{ flex: 1, minWidth: 0 }} value={c.newChannelInput} onChange={(e) => c.setNewChannelInput(e.target.value)} placeholder="@FTNMedia or a channel ID" aria-label="YouTube channel" />
          <button type="submit" className="btn" disabled={!c.newChannelInput.trim() || c.isSyncingVideos}>
            <Plus className="ic" /> Add
          </button>
        </form>
        {c.youtubeChannels.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No channels yet.
          </p>
        ) : (
          <table className="table phone-auto" style={{ border: "1px solid var(--a-border)", borderRadius: 8, overflow: "hidden", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th>Channel</th>
                <th style={{ width: 92, textAlign: "center" }}>Featured</th>
                <th style={{ width: 92, textAlign: "center" }}>Trending</th>
                <th style={{ width: 52 }} aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {c.youtubeChannels.map((channel) => (
                <tr key={channel}>
                  <td style={{ fontWeight: 600 }}>{channel}</td>
                  <td style={{ textAlign: "center" }} title="Show this channel in the featured sections of FTN and FTN+">
                    <Switch checked={!c.hiddenFeaturedChannels.includes(channel)} onChange={() => c.handleToggleHideFeatured(channel)} label={`Show ${channel} in featured`} />
                  </td>
                  <td style={{ textAlign: "center" }} title="Show this channel in the trending row">
                    <Switch checked={!c.hiddenTrendingChannels.includes(channel)} onChange={() => c.handleToggleHideTrending(channel)} label={`Show ${channel} in trending`} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn sm ghost danger"
                      aria-label={`Remove ${channel}`}
                      onClick={async () => (await confirmDialog(`Stop bringing in videos from ${channel}?`, { ok: "Remove", danger: true })) && c.handleRemoveChannel(channel)}
                    >
                      <Trash2 className="ic-sm" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Twitch channels" desc="Shown on FTN+ and the main site as live streams while they broadcast. If they never appear, ask the site administrator to add the Twitch keys in Cloudflare.">
        <form onSubmit={c.handleAddTwitchChannel} style={{ display: "flex", gap: 8 }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} value={c.newTwitchInput} onChange={(e) => c.setNewTwitchInput(e.target.value)} placeholder="ftnmedia or twitch.tv/ftnmedia" aria-label="Twitch channel" />
          <button type="submit" className="btn" disabled={!c.newTwitchInput.trim()}>
            <Plus className="ic" /> Add
          </button>
        </form>
        {c.twitchChannels.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No Twitch channels yet.
          </p>
        ) : (
          <div className="rows">
            {c.twitchChannels.map((channel) => (
              <div key={channel} className="r">
                <span className="grow trunc" style={{ fontWeight: 600 }}>
                  {channel}
                </span>
                <button type="button" className="btn sm ghost danger" aria-label={`Remove ${channel}`} onClick={() => c.setTwitchChannels(c.twitchChannels.filter((x) => x !== channel))}>
                  <Trash2 className="ic-sm" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Danger zone">
        <div className="danger-zone">
          <div className="line">
            <div>
              <div style={{ fontWeight: 600 }}>Remove the demo videos</div>
              <div className="help">Deletes the example videos the site started with. Videos from your channels stay.</div>
            </div>
            <button type="button" className="btn danger" onClick={c.handlePurgeDummyVideos} disabled={c.purgingVideos}>
              {c.purgingVideos ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ---------------- Videos ---------------- */

function VideosTab({ c }: { c: SiteConfig }) {
  const isHidden = (v: any) => c.hiddenVideoIds.includes(v.youtubeId || v.id) || c.hiddenVideoIds.includes(v.id);
  const q = c.videoSearchQuery.trim().toLowerCase();
  const filtered = c.ingestedVideos
    .filter((v) => !q || (v.title || "").toLowerCase().includes(q) || (v.channelTitle || "").toLowerCase().includes(q) || (v.youtubeId || "").toLowerCase().includes(q))
    .filter((v) => (c.videoFilter === "all" ? true : c.videoFilter === "hidden" ? isHidden(v) : !isHidden(v)));
  const shown = filtered.slice(0, c.visibleVideoCount);
  const hiddenCount = c.ingestedVideos.filter(isHidden).length;

  return (
    <div className="today wide">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div className="search" style={{ flex: "1 1 240px", maxWidth: 360 }}>
          <Search />
          <input
            className="input sm"
            value={c.videoSearchQuery}
            onChange={(e) => {
              c.setVideoSearchQuery(e.target.value);
              c.setVisibleVideoCount(25);
            }}
            placeholder="Search title, channel or video id"
            aria-label="Search videos"
          />
        </div>
        <Seg
          value={c.videoFilter}
          onChange={(v) => {
            c.setVideoFilter(v);
            c.setVisibleVideoCount(25);
          }}
          options={[
            { value: "all", label: "All" },
            { value: "shown", label: "Shown" },
            { value: "hidden", label: "Hidden", n: hiddenCount },
          ]}
          label="Show"
        />
      </div>
      {c.loadingVideos && !c.videosLoaded ? (
        <div className="empty">Loading videos…</div>
      ) : filtered.length === 0 ? (
        <div className="empty">{c.ingestedVideos.length === 0 ? "No videos yet. Add a channel, then use Sync videos now." : "No video matches."}</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <div className="rows">
            {shown.map((video) => {
              const ytid = video.youtubeId || video.id;
              const hidden = isHidden(video);
              return (
                <div key={ytid} className="r">
                  <img
                    src={video.thumbnailUrl || `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="thumb"
                    style={{ width: 96, height: 54, objectFit: "cover", flex: "none", opacity: hidden ? 0.4 : 1, filter: hidden ? "grayscale(1)" : undefined }}
                  />
                  <span className="grow">
                    <span className="trunc" style={{ display: "block", fontWeight: 600 }} title={video.title}>
                      {video.title}
                    </span>
                    <span className="t12 muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {video.isLive && <Pill tone="red">Live</Pill>}
                      <span className="trunc">{video.channelTitle || "FTN"}</span>
                    </span>
                  </span>
                  <span className="t12 muted hide-m" style={{ width: 52, flex: "none" }}>
                    {hidden ? "Hidden" : "Shown"}
                  </span>
                  <Switch checked={!hidden} onChange={() => c.handleToggleHideVideo(ytid)} label={hidden ? `Show ${video.title}` : `Hide ${video.title}`} />
                  <a href={`https://www.youtube.com/watch?v=${ytid}`} target="_blank" rel="noopener noreferrer" className="iconbtn hide-m" aria-label="Watch on YouTube" title="Watch on YouTube">
                    <ExternalLink className="ic-sm" />
                  </a>
                  <button type="button" className="btn sm ghost danger" disabled={c.deletingVideoId === ytid} onClick={() => c.handleDeleteVideo(ytid, video.title)} aria-label={`Delete ${video.title}`}>
                    <Trash2 className="ic-sm" />
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span className="t12 muted">
              {shown.length} of {filtered.length} {filtered.length === 1 ? "video" : "videos"}
              {filtered.length < c.ingestedVideos.length ? ` (out of ${c.ingestedVideos.length})` : ""}
            </span>
            {filtered.length > shown.length && (
              <button type="button" className="btn sm" onClick={() => c.setVisibleVideoCount((n) => n + 25)}>
                Show more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Rows (swimlanes) ---------------- */

function RowsTab({ c }: { c: SiteConfig }) {
  return (
    <div className="today">
      {c.swimlanes.length === 0 ? (
        <div className="empty">No custom rows yet. FTN+ shows only the trending row.</div>
      ) : (
        <section className="todo">
          <h2>
            Rows on FTN+, top to bottom <span className="c">{c.swimlanes.length}</span>
          </h2>
          <div className="rows">
            {c.swimlanes.map((lane, index) => (
              <div key={lane.id} className="r">
                <span style={{ display: "flex", flexDirection: "column", flex: "none" }}>
                  <button type="button" className="iconbtn" style={{ height: 20 }} disabled={index === 0} onClick={() => c.handleMoveSwimlane(index, "up")} aria-label={`Move ${lane.title} up`}>
                    <ArrowUp className="ic-sm" />
                  </button>
                  <button type="button" className="iconbtn" style={{ height: 20 }} disabled={index === c.swimlanes.length - 1} onClick={() => c.handleMoveSwimlane(index, "down")} aria-label={`Move ${lane.title} down`}>
                    <ArrowDown className="ic-sm" />
                  </button>
                </span>
                <span className="grow">
                  <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                    <span className="trunc" style={{ fontWeight: 600 }}>
                      {lane.title}
                    </span>
                    <Pill tone={lane.type === "playlist" ? "amber" : "grey"}>{lane.type === "playlist" ? `Playlist · ${lane.playlistVideos?.length || 0}` : "Filter"}</Pill>
                  </span>
                  <span className="t12 muted trunc" style={{ display: "block" }}>
                    {lane.type === "playlist"
                      ? `${lane.playlistVideos?.length || 0} chosen videos`
                      : [lane.channel && `Channels: ${lane.channel}`, lane.regexPattern && `Words: ${lane.regexPattern}`].filter(Boolean).join(" · ") || "All videos"}
                    {" · "}
                    {SORT_LABEL[lane.sortBy] ?? lane.sortBy}
                  </span>
                </span>
                <button type="button" className="btn sm" onClick={() => c.setEditingSwimlane(lane)}>
                  <Pencil className="ic-sm" />
                  <span className="hide-m">Edit</span>
                </button>
                <button type="button" className="btn sm ghost danger" onClick={async () => (await confirmDialog(`Remove the row “${lane.title}”?`, { ok: "Remove", danger: true })) && c.handleRemoveSwimlane(lane.id)} aria-label={`Remove ${lane.title}`}>
                  <Trash2 className="ic-sm" />
                </button>
              </div>
            ))}
          </div>
          <p className="help" style={{ margin: "6px 0 0" }}>
            Rows change on FTN+ once you save.
          </p>
        </section>
      )}

      {c.editingSwimlane && <EditRow c={c} lane={c.editingSwimlane} />}
      {c.newSwimlaneOpen && !c.editingSwimlane && <NewRow c={c} />}
    </div>
  );
}

function VideoList({ videos, onRemove }: { videos: PlaylistVideo[]; onRemove: (id: string) => void }) {
  if (videos.length === 0) return null;
  return (
    <div className="rows">
      {videos.map((video) => (
        <div key={video.youtubeId} className="r">
          {video.thumbnailUrl && <img src={video.thumbnailUrl} alt="" className="thumb" style={{ width: 64, height: 36, objectFit: "cover", flex: "none" }} />}
          <span className="grow">
            <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
              {video.title}
            </span>
            <span className="t12 muted trunc" style={{ display: "block" }}>
              {video.channelTitle} · {video.youtubeId}
            </span>
          </span>
          <button type="button" className="btn sm ghost danger" onClick={() => onRemove(video.youtubeId)} aria-label={`Remove ${video.title}`}>
            <Trash2 className="ic-sm" />
          </button>
        </div>
      ))}
    </div>
  );
}

const typeSeg = (value: "filter" | "playlist", onChange: (v: "filter" | "playlist") => void) => (
  <Seg
    value={value}
    onChange={onChange}
    options={[
      {
        value: "filter",
        label: (
          <>
            <Sliders className="ic-sm" /> By channel or words
          </>
        ) as any,
      },
      {
        value: "playlist",
        label: (
          <>
            <ListVideo className="ic-sm" /> Chosen videos
          </>
        ) as any,
      },
    ]}
    label="Kind of row"
  />
);

function EditRow({ c, lane }: { c: SiteConfig; lane: CustomSwimlane }) {
  const set = (patch: Partial<CustomSwimlane>) => c.setEditingSwimlane({ ...lane, ...patch });
  const playlist = lane.type === "playlist";
  return (
    <Sheet
      title={`Edit row: ${lane.title || "untitled"}`}
      wide
      onClose={() => c.setEditingSwimlane(null)}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={() => c.setEditingSwimlane(null)}>
            Cancel
          </button>
          <button type="submit" form="edit-row" className="btn primary" disabled={!lane.title.trim()}>
            Done
          </button>
        </>
      }
    >
      <form id="edit-row" onSubmit={c.handleSaveEditedSwimlane} style={{ display: "grid", gap: 16 }}>
        <Field label="Kind of row">{typeSeg(playlist ? "playlist" : "filter", (t) => set(t === "playlist" ? { type: "playlist", playlistVideos: lane.playlistVideos || [] } : { type: "filter" }))}</Field>
        <div className="two">
          <Field label="Title">
            <input className="input" value={lane.title} onChange={(e) => set({ title: e.target.value })} required />
          </Field>
          <Field label="Order">
            <Select value={lane.sortBy} onChange={(e) => set({ sortBy: e.target.value as any })} className="select">
              {playlist && <option value="curated">{SORT_LABEL.curated}</option>}
              <option value="recent">{SORT_LABEL.recent}</option>
              <option value="trending">{SORT_LABEL.trending}</option>
            </Select>
          </Field>
        </div>
        {playlist ? (
          <>
            <Field label="Add a YouTube video">
              <span style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 0 }}
                  value={c.editingPlaylistVideoUrl}
                  onChange={(e) => c.setEditingPlaylistVideoUrl(e.target.value)}
                  placeholder="Video link or id"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      c.handleAddVideoToEditingPlaylist();
                    }
                  }}
                />
                <button type="button" className="btn" disabled={c.addingEditPlaylistVideo || !c.editingPlaylistVideoUrl.trim()} onClick={c.handleAddVideoToEditingPlaylist}>
                  {c.addingEditPlaylistVideo ? <Loader2 className="ic spin" /> : <Plus className="ic" />} Add
                </button>
              </span>
            </Field>
            <VideoList videos={lane.playlistVideos || []} onRemove={c.handleRemoveVideoFromEditingPlaylist} />
          </>
        ) : (
          <FilterFields channel={lane.channel || ""} regex={lane.regexPattern || ""} onChannel={(v) => set({ channel: v })} onRegex={(v) => set({ regexPattern: v })} />
        )}
      </form>
    </Sheet>
  );
}

function FilterFields({ channel, regex, onChannel, onRegex }: { channel: string; regex: string; onChannel: (v: string) => void; onRegex: (v: string) => void }) {
  return (
    <>
      <Field label="Channels" help="Separate several with commas. Empty means every channel.">
        <input className="input" value={channel} onChange={(e) => onChannel(e.target.value)} placeholder="@FTNtv, @FTNsports" />
      </Field>
      <Field label="Words in the title" help="Separate alternatives with |, for example report|live. Capitals don't matter.">
        <input className="input" value={regex} onChange={(e) => onRegex(e.target.value)} placeholder="report|live" />
      </Field>
    </>
  );
}

function NewRow({ c }: { c: SiteConfig }) {
  const playlist = c.newSwimlaneType === "playlist";
  return (
    <Sheet
      title="New row"
      wide
      onClose={() => c.setNewSwimlaneOpen(false)}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={() => c.setNewSwimlaneOpen(false)}>
            Cancel
          </button>
          <button type="submit" form="new-row" className="btn primary" disabled={!c.newSwimlaneTitle.trim() || (playlist && c.newPlaylistVideos.length === 0)}>
            Add row
          </button>
        </>
      }
    >
      <form id="new-row" onSubmit={c.handleAddSwimlane} style={{ display: "grid", gap: 16 }}>
        <Field label="Kind of row">
          {typeSeg(c.newSwimlaneType, (t) => {
            c.setNewSwimlaneType(t);
            if (t === "filter" && c.newSwimlaneSort === "curated") c.setNewSwimlaneSort("recent");
          })}
        </Field>
        <div className="two">
          <Field label="Title">
            <input className="input" value={c.newSwimlaneTitle} onChange={(e) => c.setNewSwimlaneTitle(e.target.value)} placeholder={playlist ? "Best of FTN Television 2026" : "Channel exclusive"} required autoFocus />
          </Field>
          <Field label="Order">
            <Select value={c.newSwimlaneSort} onChange={(e) => c.setNewSwimlaneSort(e.target.value as any)} className="select">
              {playlist && <option value="curated">{SORT_LABEL.curated}</option>}
              <option value="recent">{SORT_LABEL.recent}</option>
              <option value="trending">{SORT_LABEL.trending}</option>
            </Select>
          </Field>
        </div>
        {playlist ? (
          <>
            <Field label="Add a YouTube video">
              <span style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 0 }}
                  value={c.newPlaylistVideoUrl}
                  onChange={(e) => c.setNewPlaylistVideoUrl(e.target.value)}
                  placeholder="Video link or id"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      c.handleAddVideoToNewPlaylist();
                    }
                  }}
                />
                <button type="button" className="btn" disabled={c.addingPlaylistVideo || !c.newPlaylistVideoUrl.trim()} onClick={c.handleAddVideoToNewPlaylist}>
                  {c.addingPlaylistVideo ? <Loader2 className="ic spin" /> : <Plus className="ic" />} Add
                </button>
              </span>
            </Field>
            <VideoList videos={c.newPlaylistVideos} onRemove={c.handleRemoveVideoFromNewPlaylist} />
          </>
        ) : (
          <FilterFields channel={c.newSwimlaneChannel} regex={c.newSwimlaneRegex} onChannel={c.setNewSwimlaneChannel} onRegex={c.setNewSwimlaneRegex} />
        )}
      </form>
    </Sheet>
  );
}

export default function AdminPlusContentPage() {
  return (
    <AdminAuthGuard requiredPermission={canConfigureSite} featureTitle="FTN+ content">
      <React.Suspense fallback={null}>
        <PlusContentPage />
      </React.Suspense>
    </AdminAuthGuard>
  );
}
