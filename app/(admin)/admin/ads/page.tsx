"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Loader2, Pause, Pencil, Play, Plus, Trash2, Upload } from "lucide-react";
import { Select } from "@/components/ui/select";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { BackButton, Body, Facts, Field, PageBar, Pill, Screen, Section, Seg, Sheet, type Tone } from "@/components/admin/ui";
import { refreshAdminSummary } from "@/lib/admin-summary";
import { canManageAds } from "@/lib/rbac";
import { RO_STATES } from "@/lib/ro-states";
import { cn } from "@/lib/utils";

function parseLinks(raw: unknown): Record<string, string> {
  try {
    const o = JSON.parse(typeof raw === "string" ? raw : "{}");
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

type AdFormat = "1024x180" | "512x180";

const FORMAT_DIMENSIONS: Record<AdFormat, [number, number]> = {
  "1024x180": [1024, 180],
  "512x180": [512, 180],
};
const FORMAT_LABEL: Record<string, string> = {
  "1024x180": "1024 × 180, full width",
  "512x180": "512 × 180, shared with another ad",
};

const ZONE_LABELS: Record<string, string> = {
  header_leaderboard: "Homepage top",
  in_feed_banner: "Articles inline",
  sidebar_rectangle: "Sports sidebar",
};

const ZONE_FORM_VALUES: Record<string, string> = {
  header_leaderboard: "homepage_top",
  in_feed_banner: "articles_inline",
  sidebar_rectangle: "sports_sidebar",
};

function readImageSize(file: File): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve([img.naturalWidth, img.naturalHeight]);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error("Could not read image"));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

type Filter = "running" | "paused" | "soldout" | "all";

const isSoldOut = (c: any) => c.impressionsLeft !== null && c.impressionsLeft !== undefined && c.impressionsLeft <= 0;
function stateOf(c: any): {
  key: Exclude<Filter, "all">;
  label: string;
  tone: Tone;
} {
  if (isSoldOut(c)) return { key: "soldout", label: "Sold out", tone: "red" };
  if (c.status !== "active") return { key: "paused", label: "Paused", tone: "grey" };
  return { key: "running", label: "Running", tone: "green" };
}
const ctr = (views: number, clicks: number) => (views > 0 ? ((clicks / views) * 100).toFixed(1) : "0.0");
const host = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};

function AdsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("id");
  const select = (id: string | null) => router.replace(id ? `/admin/ads?id=${encodeURIComponent(id)}` : "/admin/ads", { scroll: false });

  const [campaigns, setCampaigns] = useState<any[] | null>(null);
  const [organizers, setOrganizers] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>("running");
  const [orgFilter, setOrgFilter] = useState("");
  const [busy, setBusy] = useState(false);

  // Form (in a sheet)
  const [sheet, setSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [organizerId, setOrganizerId] = useState("");
  const [newOrganizer, setNewOrganizer] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [messageLinks, setMessageLinks] = useState<Record<string, string>>({});
  const [impressions, setImpressions] = useState("");
  const [format, setFormat] = useState<AdFormat>("1024x180");
  const [zone, setZone] = useState("homepage_top");
  const fileInput = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      const [adsRes, orgRes] = await Promise.all([fetch("/api/admin/ads"), fetch("/api/admin/organizers")]);
      if (adsRes.ok) {
        const data = (await adsRes.json()) as any;
        setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
      } else setCampaigns([]);
      if (orgRes.ok) {
        const data = (await orgRes.json()) as any;
        if (Array.isArray(data.organizers)) setOrganizers(data.organizers);
      }
    } catch (err) {
      console.error("Failed to load ads:", err);
      setCampaigns([]);
    }
    refreshAdminSummary();
  };

  useEffect(() => {
    loadData();
  }, []);

  // Open the ad from a link (?id=) on the right filter.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !campaigns || !selectedId) return;
    const c = campaigns.find((x) => x.id === selectedId);
    if (c) setFilter(stateOf(c).key);
    opened.current = true;
  }, [campaigns, selectedId]);

  const resetForm = () => {
    setSheet(false);
    setEditingId(null);
    setTitle("");
    setOrganizerId("");
    setNewOrganizer("");
    setImageUrl("");
    setTargetUrl("");
    setMessageLinks({});
    setImpressions("");
    setFormat("1024x180");
    setZone("homepage_top");
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const [w, h] = await readImageSize(file);
      const [expectedW, expectedH] = FORMAT_DIMENSIONS[format];
      if (w !== expectedW || h !== expectedH) {
        toast(`This image is ${w}x${h}. The ${format} format needs exactly ${expectedW}x${expectedH}.`);
        e.target.value = "";
        return;
      }
    } catch {
      toast("Could not read this image.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "ads");
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = (await res.json()) as any;
      if (!res.ok) {
        toast(data.error || "Upload failed");
        return;
      }
      setImageUrl(data.url);
    } catch (err) {
      console.error("Ad upload error:", err);
      toast("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const createOrganizer = async (name: string): Promise<string | null> => {
    const res = await fetch("/api/admin/organizers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) {
      toast(data.error || "Failed to create organizer");
      return null;
    }
    return data.organizer.id as string;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !imageUrl.trim() || !targetUrl.trim() || (!organizerId && !newOrganizer.trim())) {
      toast("Please fill in the title, organizer, image and destination URL.");
      return;
    }
    const purchased = impressions.trim() === "" ? null : Number(impressions);
    if (purchased !== null && (!Number.isInteger(purchased) || purchased < 0)) {
      toast("Post impressions must be a whole number, or empty for unlimited.");
      return;
    }
    setSubmitting(true);
    try {
      let orgId = organizerId;
      if (!orgId) {
        const created = await createOrganizer(newOrganizer.trim());
        if (!created) return;
        orgId = created;
      }
      const payload = {
        title: title.trim(),
        organizerId: orgId,
        imageUrl: imageUrl.trim(),
        targetUrl: targetUrl.trim(),
        messageLinks,
        postImpressionsPurchased: purchased,
        format,
        zone,
      };
      const res = await fetch(editingId ? `/api/admin/ads/${editingId}` : "/api/admin/ads", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        toast(data.error || "Failed to save ad");
        return;
      }
      const newId = editingId || data.campaign?.id || data.id;
      resetForm();
      await loadData();
      if (newId) {
        if (!editingId) setFilter("running");
        select(newId);
      }
    } catch (err) {
      console.error("Save ad error:", err);
      toast("An unexpected error occurred while saving the ad.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEditing = (c: any) => {
    setEditingId(c.id);
    setTitle(c.title || c.name);
    setOrganizerId(c.organizerId || "");
    setNewOrganizer("");
    setImageUrl(c.imageUrl);
    setTargetUrl(c.targetUrl);
    setMessageLinks(parseLinks(c.messageLinks));
    setImpressions(c.postImpressionsPurchased === null || c.postImpressionsPurchased === undefined ? "" : String(c.postImpressionsPurchased));
    setFormat((c.adFormat || "1024x180") as AdFormat);
    setZone(ZONE_FORM_VALUES[c.zone] || "homepage_top");
    setSheet(true);
  };

  const toggleStatus = async (c: any) => {
    const next = c.status === "active" ? "paused" : "active";
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/ads/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setCampaigns((prev) => (prev || []).map((x) => (x.id === c.id ? { ...x, status: next } : x)));
        refreshAdminSummary();
      } else {
        const data = (await res.json()) as any;
        toast(data.error || "Failed to update ad");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (c: any) => {
    if (!(await confirmDialog(`Delete the ad “${c.title || c.name}”? This can't be undone.`, { ok: "Delete", danger: true }))) return;
    try {
      const res = await fetch(`/api/admin/ads?id=${encodeURIComponent(c.id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setCampaigns((prev) => (prev || []).filter((x) => x.id !== c.id));
        if (selectedId === c.id) select(null);
        refreshAdminSummary();
      } else {
        const data = (await res.json()) as any;
        toast(data.error || "Failed to delete ad");
      }
    } catch (err) {
      console.error("Delete ad error:", err);
      toast("Failed to delete ad");
    }
  };

  const all = campaigns || [];
  const totalViews = all.reduce((acc, c) => acc + (c.impressionsCount || 0), 0);
  const totalClicks = all.reduce((acc, c) => acc + (c.clicksCount || 0), 0);
  const counts = useMemo(() => {
    const n = { running: 0, paused: 0, soldout: 0, all: all.length };
    for (const c of all) n[stateOf(c).key]++;
    return n;
  }, [all]);
  const shown = (filter === "all" ? all : all.filter((c) => stateOf(c).key === filter)).filter((c) => !orgFilter || (orgFilter === "none" ? !c.organizerId : c.organizerId === orgFilter));

  // Ads grouped under their organizer; organizers with no ads in this filter are left out.
  const groups = useMemo(() => {
    const known = new Set(organizers.map((o) => o.id));
    const out = organizers
      .map((o) => ({
        key: o.id,
        name: o.name as string,
        ads: shown.filter((c) => c.organizerId === o.id),
      }))
      .filter((g) => g.ads.length > 0);
    const none = shown.filter((c) => !c.organizerId || !known.has(c.organizerId));
    if (none.length) out.push({ key: "none", name: "No organizer", ads: none });
    return out;
  }, [organizers, shown]);
  const emptyOrganizers = organizers.filter((o) => !all.some((c) => c.organizerId === o.id));

  const picked = all.find((c) => c.id === selectedId) ?? null;
  // On a computer the first ad shows straight away; on a phone the list stays until one is tapped.
  const current = picked ?? groups[0]?.ads[0] ?? null;
  const orgName = (id: string) => organizers.find((o) => o.id === id)?.name;

  const filters = [
    { value: "running" as const, label: "Running", n: counts.running },
    { value: "paused" as const, label: "Paused", n: counts.paused },
    { value: "soldout" as const, label: "Sold out", n: counts.soldout },
    { value: "all" as const, label: "All", n: counts.all },
  ];
  const statsLine = `All time: ${totalViews.toLocaleString()} site views · ${totalClicks.toLocaleString()} clicks · ${ctr(totalViews, totalClicks)}%`;

  return (
    <Screen>
      <PageBar
        title="Ads"
        tools={
          <>
            <Seg value={filter} onChange={setFilter} options={filters} label="Show" />
            <select className="select sm" style={{ width: 170 }} value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} aria-label="Organizer">
              <option value="">All organizers</option>
              {organizers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <span className="t12 muted trunc" style={{ whiteSpace: "nowrap" }}>
              {statsLine}
            </span>
          </>
        }
        end={
          <button
            type="button"
            className="btn primary has-lbl-m"
            aria-label="New ad"
            onClick={() => {
              resetForm();
              setSheet(true);
            }}
          >
            <Plus className="ic" />
            <span className="lbl-m">New ad</span>
          </button>
        }
        mrow={
          <>
            <select className="select sm" style={{ flex: 1 }} value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Show">
              {filters.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label} ({f.n})
                </option>
              ))}
            </select>
            {organizers.length > 1 && (
              <select className="select sm" style={{ flex: 1 }} value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} aria-label="Organizer">
                <option value="">All organizers</option>
                {organizers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </>
        }
      />
      <Body>
        <div className={cn("ld", picked && "detail")}>
          <div className="ld-list">
            {campaigns === null ? (
              <div className="empty">Loading ads…</div>
            ) : shown.length === 0 ? (
              <div className="empty">
                {all.length === 0 ? "No ads yet. Make the first one with New ad." : filter === "running" ? "No ad is running." : filter === "paused" ? "No ad is paused." : "No ad is sold out."}
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.key}>
                  <div className="group">
                    <span className="trunc">{g.name}</span>
                    <span>
                      {g.ads.length} {g.ads.length === 1 ? "ad" : "ads"}
                    </span>
                  </div>
                  {g.ads.map((c) => {
                    const total = c.postImpressionsPurchased;
                    const left = c.impressionsLeft ?? 0;
                    const used = total ? Math.max(0, Math.min(100, ((total - left) / total) * 100)) : 0;
                    return (
                      <button key={c.id} type="button" className={cn("item", c.id === current?.id && "on")} onClick={() => select(c.id)}>
                        <img
                          src={c.imageUrl}
                          alt=""
                          className="thumb"
                          style={{
                            width: 96,
                            height: c.adFormat === "512x180" ? 34 : 17,
                            borderRadius: 3,
                            objectFit: "cover",
                            flex: "none",
                          }}
                        />
                        <span className="grow">
                          <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                            {c.title || c.name}
                          </span>
                          <span className="meta">
                            {filter === "all" && <Pill tone={stateOf(c).tone}>{stateOf(c).label}</Pill>}
                            {total === null || total === undefined ? (
                              "Unlimited posts"
                            ) : (
                              <>
                                <span className={cn("meter", left <= Math.max(2, total * 0.2) && "low")} style={{ width: 80, flex: "none" }}>
                                  <i style={{ width: `${used}%` }} />
                                </span>
                                <span className="trunc">
                                  {Math.max(0, left)} of {total} posts left
                                </span>
                              </>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
            {campaigns && emptyOrganizers.length > 0 && filter === "all" && (
              <div>
                <div className="group">
                  <span>Organizers with no ads</span>
                  <span>{emptyOrganizers.length}</span>
                </div>
                {emptyOrganizers.map((o) => (
                  <div key={o.id} className="item" style={{ cursor: "default" }}>
                    <span className="grow muted trunc">{o.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ld-pane">
            {!current ? (
              <div className="pane-empty">{all.length ? "Pick an ad to see how it's doing." : ""}</div>
            ) : (
              <AdDetail
                ad={current}
                organizer={orgName(current.organizerId)}
                busy={busy}
                onBack={() => select(null)}
                onEdit={() => startEditing(current)}
                onToggle={() => toggleStatus(current)}
                onDelete={() => handleDelete(current)}
              />
            )}
          </div>
        </div>
      </Body>

      {sheet && (
        <Sheet
          title={editingId ? "Edit ad" : "New ad"}
          onClose={resetForm}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit" form="ad-form" className="btn primary" disabled={submitting || uploading}>
                {submitting ? "Saving…" : editingId ? "Save changes" : "Create ad"}
              </button>
            </>
          }
        >
          <form id="ad-form" onSubmit={handleSave} style={{ display: "grid", gap: 20 }}>
            <Section title="Who and where">
              <Field label="Ad title">
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spring fares" />
              </Field>
              <div className="two">
                <Field label="Organizer">
                  <Select value={organizerId} onChange={(e) => setOrganizerId(e.target.value)} className="select">
                    <option value="">New organizer…</option>
                    {organizers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {!organizerId && (
                  <Field label="New organizer name">
                    <input className="input" value={newOrganizer} onChange={(e) => setNewOrganizer(e.target.value)} placeholder="Organization name" />
                  </Field>
                )}
              </div>
              <div className="two">
                <Field label="Format">
                  <Select value={format} onChange={(e) => setFormat(e.target.value as AdFormat)} className="select">
                    <option value="1024x180">1024x180 (single ad)</option>
                    <option value="512x180">512x180 (shared ad)</option>
                  </Select>
                </Field>
                <Field label="On the site">
                  <Select value={zone} onChange={(e) => setZone(e.target.value)} className="select">
                    <option value="homepage_top">Homepage top</option>
                    <option value="articles_inline">Articles inline</option>
                    <option value="sports_sidebar">Sports sidebar</option>
                  </Select>
                </Field>
              </div>
            </Section>

            <Section title="Banner and links">
              <Field label="Banner" help={`Exactly ${FORMAT_DIMENSIONS[format].join(" × ")} px. PNG, JPEG, WebP or GIF.`}>
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFileChosen} hidden />
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt="Banner preview"
                    style={{
                      width: "100%",
                      maxWidth: 512,
                      borderRadius: 6,
                      border: "1px solid var(--a-border)",
                    }}
                  />
                )}
                <button type="button" className="btn" disabled={uploading} onClick={() => fileInput.current?.click()}>
                  {uploading ? <Loader2 className="ic spin" /> : <Upload className="ic" />}
                  {imageUrl ? "Replace banner" : "Upload banner"}
                </button>
              </Field>
              <Field label="Clicks on the site go to">
                <input className="input" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://…" inputMode="url" />
              </Field>
              <Field label="Discord message links" help="Used in Discord posts, one per Ro-State. Leave one empty to use the site link.">
                <div style={{ display: "grid", gap: 6 }}>
                  {RO_STATES.map((r) => (
                    <div
                      key={r.key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "100px minmax(0,1fr)",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <span className="t12" style={{ fontWeight: 600 }}>
                        {r.label}
                      </span>
                      <input
                        className="input sm"
                        value={messageLinks[r.key] || ""}
                        onChange={(e) =>
                          setMessageLinks((prev) => ({
                            ...prev,
                            [r.key]: e.target.value,
                          }))
                        }
                        placeholder="Same as the site link"
                        aria-label={`Message link for ${r.label}`}
                      />
                    </div>
                  ))}
                </div>
              </Field>
            </Section>

            <Section title="Delivery">
              <Field label="Post impressions" help="How many posts the ad goes on. Empty means unlimited. The ad shows on the site only while it has some left.">
                <input className="input" style={{ maxWidth: 160 }} value={impressions} onChange={(e) => setImpressions(e.target.value)} inputMode="numeric" placeholder="Unlimited" />
              </Field>
            </Section>
          </form>
        </Sheet>
      )}
    </Screen>
  );
}

function AdDetail({
  ad,
  organizer,
  busy,
  onBack,
  onEdit,
  onToggle,
  onDelete,
}: {
  ad: any;
  organizer?: string;
  busy: boolean;
  onBack: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const st = stateOf(ad);
  const links = parseLinks(ad.messageLinks);
  const set = RO_STATES.filter((r) => links[r.key]);
  const total = ad.postImpressionsPurchased;
  const views = ad.impressionsCount || 0;
  const clicks = ad.clicksCount || 0;
  return (
    <>
      <div className="pane-head capped">
        <BackButton onClick={onBack} label="Back to ads" />
        <Pill tone={st.tone} dot>
          {st.label}
        </Pill>
        <span className="trunc" style={{ fontWeight: 600 }}>
          {ad.title || ad.name}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, flex: "none" }}>
          <button type="button" className="btn sm" disabled={busy} onClick={onToggle}>
            {ad.status === "active" ? <Pause className="ic-sm" /> : <Play className="ic-sm" />}
            <span className="hide-m">{ad.status === "active" ? "Pause" : "Resume"}</span>
          </button>
          <button type="button" className="btn sm" onClick={onEdit}>
            <Pencil className="ic-sm" /> Edit
          </button>
          <button type="button" className="btn sm ghost danger" onClick={onDelete} aria-label="Delete ad">
            <Trash2 className="ic-sm" />
            <span className="hide-m">Delete</span>
          </button>
        </span>
      </div>
      <div className="pane-body capped" style={{ display: "grid", gap: 20, alignContent: "start" }}>
        <img
          src={ad.imageUrl}
          alt=""
          style={{
            width: "100%",
            maxWidth: ad.adFormat === "512x180" ? 512 : undefined,
            borderRadius: 8,
            border: "1px solid var(--a-border)",
          }}
        />
        <div className="stats">
          <div className="card stat">
            <span>Post impressions</span>
            <b>
              {total === null || total === undefined ? (
                "Unlimited"
              ) : (
                <>
                  {Math.max(0, ad.impressionsLeft ?? 0)} <span className="t12 muted">of {total} left</span>
                </>
              )}
            </b>
          </div>
          <div className="card stat">
            <span>Site views</span>
            <b>{views.toLocaleString()}</b>
          </div>
          <div className="card stat">
            <span>Clicks</span>
            <b>
              {clicks.toLocaleString()} <span className="t12 muted">{ctr(views, clicks)}%</span>
            </b>
          </div>
        </div>
        <Facts
          rows={[
            ["Organizer", organizer || "None"],
            ["Format", FORMAT_LABEL[ad.adFormat] || ad.adFormat || "1024 × 180"],
            ["On the site", ZONE_LABELS[ad.zone] || ad.zone],
            [
              "Clicks go to",
              ad.targetUrl ? (
                <a
                  href={ad.targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                  style={{
                    display: "inline-flex",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  {host(ad.targetUrl)} <ExternalLink className="ic-sm" />
                </a>
              ) : (
                "None"
              ),
            ],
            [
              "Discord links",
              set.length === 0 ? (
                "Same as the site link in every Ro-State"
              ) : (
                <span style={{ display: "grid", gap: 2 }}>
                  {RO_STATES.map((r) => (
                    <span key={r.key} className="trunc">
                      <span className="muted">{r.label}: </span>
                      {links[r.key] ? host(links[r.key]) : <span className="muted">site link</span>}
                    </span>
                  ))}
                </span>
              ),
            ],
            ...(st.key === "soldout" ? ([["On the site now", "Hidden: no post impressions left"]] as [React.ReactNode, React.ReactNode][]) : []),
          ]}
        />
      </div>
    </>
  );
}

export default function AdminAdsConsole() {
  return (
    <AdminAuthGuard requiredPermission={canManageAds} featureTitle="Ads">
      <React.Suspense fallback={null}>
        <AdsPage />
      </React.Suspense>
    </AdminAuthGuard>
  );
}
