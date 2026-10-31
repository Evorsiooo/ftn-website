"use client";
import { Select } from "@/components/ui/select";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import React, { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Eye, MousePointerClick, TrendingUp, ArrowLeft, DollarSign, Trash2, Loader2, Pencil, Pause, Play, Upload } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader, AdminTab } from "@/components/gs/admin-header";
import { canManageAds } from "@/lib/rbac";
import { RO_STATES } from "@/lib/ro-states";

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

const ZONE_LABELS: Record<string, string> = {
  header_leaderboard: "Homepage Top",
  in_feed_banner: "Articles Inline",
  sidebar_rectangle: "Sports Sidebar",
};

const ZONE_FORM_VALUES: Record<string, string> = {
  header_leaderboard: "homepage_top",
  in_feed_banner: "articles_inline",
  sidebar_rectangle: "sports_sidebar",
};

const labelClass = "block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1";
const selectClass =
  "w-full h-9 rounded-md border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

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

export default function AdminAdsConsole() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [organizers, setOrganizers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
        if (Array.isArray(data.campaigns)) setCampaigns(data.campaigns);
      }
      if (orgRes.ok) {
        const data = (await orgRes.json()) as any;
        if (Array.isArray(data.organizers)) setOrganizers(data.organizers);
      }
    } catch (err) {
      console.error("Failed to load ads:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const resetForm = () => {
    setDrawerOpen(false);
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
      resetForm();
      await loadData();
    } catch (err) {
      console.error("Save ad error:", err);
      toast("An unexpected error occurred while saving the ad.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEditing = (c: any) => {
    setDrawerOpen(true);
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleStatus = async (c: any) => {
    const next = c.status === "active" ? "paused" : "active";
    const res = await fetch(`/api/admin/ads/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
    } else {
      const data = (await res.json()) as any;
      toast(data.error || "Failed to update ad");
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog("Are you sure you want to delete this ad?")) return;
    try {
      const res = await fetch(`/api/admin/ads?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        setCampaigns((prev) => prev.filter((c) => c.id !== id));
        if (editingId === id) resetForm();
      } else {
        const data = (await res.json()) as any;
        toast(data.error || "Failed to delete ad");
      }
    } catch (err) {
      console.error("Delete ad error:", err);
      toast("Failed to delete ad");
    }
  };

  const totalImpressions = campaigns.reduce((acc, c) => acc + (c.impressionsCount || 0), 0);
  const totalClicks = campaigns.reduce((acc, c) => acc + (c.clicksCount || 0), 0);
  const averageCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00";

  // Group ads under their organizer, keeping organizers without ads visible.
  const groups = organizers.map((o) => ({
    organizer: o,
    ads: campaigns.filter((c) => c.organizerId === o.id),
  }));
  const unassigned = campaigns.filter((c) => !c.organizerId || !organizers.some((o) => o.id === c.organizerId));

  const renderAd = (c: any) => {
    const left = c.impressionsLeft;
    const soldOut = left !== null && left !== undefined && left <= 0;
    return (
      <div key={c.id} className="flex gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
        <img src={c.imageUrl} alt={c.title || c.name} className="h-12 w-auto max-w-[45%] rounded object-contain bg-neutral-100 dark:bg-neutral-900" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="truncate text-sm font-bold text-neutral-900 dark:text-white">{c.title || c.name}</h4>
            <div className="flex shrink-0 items-center gap-1">
              <span className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400 mr-1">{c.adFormat}</span>
              <button type="button" onClick={() => startEditing(c)} className="p-1 text-neutral-400 hover:text-brand-text cursor-pointer" title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => toggleStatus(c)} className="p-1 text-neutral-400 hover:text-amber-500 cursor-pointer" title={c.status === "active" ? "Pause" : "Resume"}>
                {c.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <button type="button" onClick={() => handleDelete(c.id)} className="p-1 text-neutral-400 hover:text-red-500 cursor-pointer" title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {c.postImpressionsPurchased ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" title="Post impressions left">
              <div className={soldOut ? "h-full bg-red-500" : "h-full bg-brand"} style={{ width: `${Math.max(0, Math.min(100, ((left ?? 0) / c.postImpressionsPurchased) * 100))}%` }} />
            </div>
          ) : null}
          <p className="truncate text-[11px] text-neutral-600 dark:text-neutral-400">Destination: {c.targetUrl}</p>
          <p className="truncate text-[11px] text-neutral-600 dark:text-neutral-400">Message links: {(() => { const l = parseLinks(c.messageLinks); const n = RO_STATES.filter((r) => l[r.key]).length; return n ? `${n} of ${RO_STATES.length} Ro-States` : "same as destination"; })()}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-600 dark:text-neutral-400">
            <span>Zone: {ZONE_LABELS[c.zone] || c.zone}</span>
            <span>
              Post impressions:{" "}
              <strong className={soldOut ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-white"}>
                {c.postImpressionsPurchased === null || c.postImpressionsPurchased === undefined
                  ? "unlimited"
                  : `${left} left of ${c.postImpressionsPurchased}`}
              </strong>
            </span>
            <span>Views: <strong className="text-neutral-900 dark:text-white">{(c.impressionsCount || 0).toLocaleString()}</strong></span>
            <span>Clicks: <strong className="text-neutral-900 dark:text-white">{c.clicksCount || 0}</strong></span>
            <span>CTR: <strong className="text-neutral-900 dark:text-white">{c.impressionsCount ? (((c.clicksCount || 0) / c.impressionsCount) * 100).toFixed(2) : "0.00"}%</strong></span>
            <span className={c.status === "active" && !soldOut ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
              {soldOut ? "sold out (hidden)" : c.status}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AdminAuthGuard requiredPermission={canManageAds} featureTitle="Commercial & Advertisements Console">
      <div className="w-full space-y-8 text-neutral-900 dark:text-white">
        <AdminPageHeader
          title="Advertisements"
          description="What is running, how much is left, and how it performs."
          actions={
            <Button size="sm" onClick={() => { resetForm(); setDrawerOpen(true); }} className="h-10 cursor-pointer px-5 text-sm">
              New ad
            </Button>
          }
        />

        <dl className="grid grid-cols-3 divide-x divide-neutral-200 rounded-[1.75rem] bg-[#16110a] text-[#fff8e6] dark:divide-neutral-800 dark:bg-black [&>div]:p-5 sm:[&>div]:p-8">
          <div>
            <dt className="text-xs font-bold uppercase tracking-widest opacity-60">Site views</dt>
            <dd className="gs-display mt-2 text-3xl font-extrabold text-brand sm:text-6xl">{totalImpressions.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-widest opacity-60">Clicks</dt>
            <dd className="gs-display mt-2 text-3xl font-extrabold text-brand sm:text-6xl">{totalClicks.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-widest opacity-60">CTR</dt>
            <dd className="gs-display mt-2 text-3xl font-extrabold text-brand sm:text-6xl">{averageCtr}%</dd>
          </div>
        </dl>

        <div className="space-y-8">
          {drawerOpen && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={resetForm}>
          <aside role="dialog" aria-label={editingId ? "Edit ad" : "New ad"} onClick={(e) => e.stopPropagation()} className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-background text-foreground shadow-2xl">
          <div className="flex items-center justify-between bg-brand px-6 py-5 text-brand-ink">
            <h2 className="text-xl font-extrabold">{editingId ? "Edit ad" : "New ad"}</h2>
            <button type="button" onClick={resetForm} aria-label="Close" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#16110a] text-lg leading-none text-[#fff8e6] hover:bg-black">×</button>
          </div>
          <div className="space-y-4 p-6">
            <form onSubmit={handleSave} className="space-y-4">
              <h3 className="border-b border-neutral-200 pb-1.5 pt-2 text-xs font-bold uppercase tracking-widest text-neutral-500 dark:border-neutral-800">Who and where</h3>
              <div>
                <label className={labelClass}>Ad title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Organizer</label>
                  <Select value={organizerId} onChange={(e) => setOrganizerId(e.target.value)} className={selectClass}>
                    <option value="">New organizer...</option>
                    {organizers.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </Select>
                </div>
                {!organizerId && (
                  <div>
                    <label className={labelClass}>New organizer name</label>
                    <Input value={newOrganizer} onChange={(e) => setNewOrganizer(e.target.value)} placeholder="Organization name" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Format</label>
                  <Select value={format} onChange={(e) => setFormat(e.target.value as AdFormat)} className={selectClass}>
                    <option value="1024x180">1024x180 (single ad)</option>
                    <option value="512x180">512x180 (shared ad)</option>
                  </Select>
                </div>
                <div>
                  <label className={labelClass}>Website Zone</label>
                  <Select value={zone} onChange={(e) => setZone(e.target.value)} className={selectClass}>
                    <option value="homepage_top">Homepage Top</option>
                    <option value="articles_inline">Articles Inline</option>
                    <option value="sports_sidebar">Sports Sidebar</option>
                  </Select>
                </div>
              </div>

              <h3 className="border-b border-neutral-200 pb-1.5 pt-2 text-xs font-bold uppercase tracking-widest text-neutral-500 dark:border-neutral-800">Creative</h3>
              <div>
                <label className={labelClass}>Ad image</label>
                <div className="flex items-center gap-2">
                  <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFileChosen} className="hidden" />
                  <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()} className="cursor-pointer">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
                    {imageUrl ? "Replace image" : "Upload image"}
                  </Button>
                  <span className="text-[11px] text-neutral-500">Exactly {FORMAT_DIMENSIONS[format].join("x")} px</span>
                </div>
                {imageUrl && (
                  <img src={imageUrl} alt="Ad preview" className="mt-2 w-full max-w-[512px] rounded border border-neutral-200 dark:border-neutral-800" />
                )}
              </div>

              <div>
                <label className={labelClass}>Destination URL (opened when the ad is clicked on the website)</label>
                <Input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://..." />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Message links (used in Discord posts, one per Ro-State, all optional)</label>
                {RO_STATES.map((r) => (
                  <div key={r.key} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{r.label}</span>
                    <Input
                      value={messageLinks[r.key] || ""}
                      onChange={(e) => setMessageLinks((prev) => ({ ...prev, [r.key]: e.target.value }))}
                      placeholder="Empty = destination URL"
                    />
                  </div>
                ))}
              </div>

              <h3 className="border-b border-neutral-200 pb-1.5 pt-2 text-xs font-bold uppercase tracking-widest text-neutral-500 dark:border-neutral-800">Delivery</h3>
              <div>
                <label className={labelClass}>Post impressions (empty = unlimited)</label>
                <Input value={impressions} onChange={(e) => setImpressions(e.target.value)} inputMode="numeric" placeholder="e.g. 20" />
                <p className="mt-1 text-[11px] text-neutral-500">The ad shows on the website only while it has post impressions left.</p>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={submitting || uploading} className="flex-1 font-semibold bg-brand hover:bg-brand-hover text-brand-ink cursor-pointer shadow-sm disabled:opacity-50">
                  {submitting ? "Saving..." : editingId ? "Save Changes" : "Save Ad"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} className="cursor-pointer">
                  Cancel
                </Button>
              </div>
            </form>
          </div>
          </aside>
          </div>
          )}

          <div className="space-y-4">
            <h2 className="text-lg font-extrabold">Running, by organizer</h2>
            {loading ? (
              <div className="flex items-center justify-center p-8 text-neutral-500">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading ads...
              </div>
            ) : groups.length === 0 && unassigned.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-neutral-300 dark:border-neutral-800 rounded-lg text-xs text-neutral-500">
                No ads yet. Create the first one on the left.
              </div>
            ) : (
              <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {groups.map(({ organizer, ads }) => (
                  <Card key={organizer.id} className="p-4 rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 space-y-3">
                    <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                      {organizer.name} <span className="font-normal text-neutral-500">({ads.length} {ads.length === 1 ? "ad" : "ads"})</span>
                    </h3>
                    {ads.length === 0 ? <p className="text-xs text-neutral-500">No ads yet.</p> : ads.map(renderAd)}
                  </Card>
                ))}
                {unassigned.length > 0 && (
                  <Card className="p-4 rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 space-y-3">
                    <h3 className="font-bold text-sm text-neutral-900 dark:text-white">No organizer</h3>
                    {unassigned.map(renderAd)}
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminAuthGuard>
  );
}
