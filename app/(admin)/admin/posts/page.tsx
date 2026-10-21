"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Download, Loader2, Newspaper, Pencil, Shuffle, Trash2, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { canManagePosts, isPostsLeadership } from "@/lib/rbac";
import { RO_STATES } from "@/lib/ro-states";
import { PostLayout, loadImage, logoForRoState, renderPost } from "@/lib/post-template";

const labelClass = "block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1";
const fieldClass =
  "w-full rounded-md border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-3 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

// Editor-only backdrop: the saved image is transparent outside the post, and the white
// disclaimer needs something dark behind it to be readable here.
const CHECKERBOARD: React.CSSProperties = {
  backgroundColor: "#2a2a2a",
  backgroundImage:
    "linear-gradient(45deg, #3a3a3a 25%, transparent 25%), linear-gradient(-45deg, #3a3a3a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #3a3a3a 75%), linear-gradient(-45deg, transparent 75%, #3a3a3a 75%)",
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "text-amber-600 dark:text-amber-400",
  approved: "text-emerald-600 dark:text-emerald-400",
  denied: "text-red-600 dark:text-red-400",
};

async function uploadToPosts(file: Blob, name: string): Promise<string> {
  const body = new FormData();
  body.append("file", new File([file], name, { type: file.type }));
  body.append("folder", "posts");
  const res = await fetch("/api/upload", { method: "POST", body });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url as string;
}

export default function AdminPostsPage() {
  const [me, setMe] = useState<{ id: string; roles: string[] } | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [suggestedAdId, setSuggestedAdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [roState, setRoState] = useState("");
  const [adId, setAdId] = useState("");
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [focusX, setFocusX] = useState(0.5);
  const [focusY, setFocusY] = useState(0.5);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [layout, setLayout] = useState<PostLayout | null>(null);
  const [previewError, setPreviewError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const renderToken = useRef(0);

  const isLeadership = me ? isPostsLeadership(me.roles) : false;

  const loadAll = useCallback(async () => {
    try {
      const [postsRes, optionsRes, sessionRes] = await Promise.all([
        fetch("/api/admin/posts"),
        fetch("/api/admin/posts/options"),
        fetch("/api/auth/session"),
      ]);
      if (postsRes.ok) setPosts(((await postsRes.json()) as any).posts || []);
      if (optionsRes.ok) {
        const data = (await optionsRes.json()) as any;
        setAds(data.ads || []);
        setSuggestedAdId(data.suggestedAdId || null);
      }
      if (sessionRes.ok) {
        const data = (await sessionRes.json()) as any;
        if (data.user) setMe({ id: data.user.id, roles: data.user.roles || [] });
      }
    } catch (err) {
      console.error("Failed to load posts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const selectedAd = ads.find((a) => a.id === adId) || null;
  const logo = logoForRoState(roState);

  // Live preview: redraw the canvas whenever an input changes.
  useEffect(() => {
    const token = ++renderToken.current;
    (async () => {
      try {
        const adImg = selectedAd ? await loadImage(selectedAd.imageUrl) : null;
        if (!canvasRef.current || token !== renderToken.current) return;
        const result = await renderPost(canvasRef.current, {
          headline,
          body,
          photo,
          photoZoom: zoom,
          photoFocusX: focusX,
          photoFocusY: focusY,
          logo,
          ad: adImg,
        });
        if (token === renderToken.current) {
          setLayout(result);
          setPreviewError("");
        }
      } catch (err: any) {
        if (token === renderToken.current) {
          setPreviewError(
            selectedAd
              ? "This ad's image can't be used on a post. Re-upload it from the Advertisements page."
              : err?.message || "Preview failed"
          );
        }
      }
    })();
  }, [headline, body, photo, zoom, focusX, focusY, logo, selectedAd]);

  // Downloads the image as it is now, without saving the post or using an ad impression.
  const handleExport = async () => {
    if (previewError || !canvasRef.current) return alert(previewError || "Preview is not ready.");
    const blob = await new Promise<Blob | null>((resolve) => canvasRef.current!.toBlob(resolve, "image/png"));
    if (!blob) return alert("Could not create the image");
    const slug = headline.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug || "post"}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const resetForm = () => {
    setEditingId(null);
    setHeadline("");
    setBody("");
    setRoState("");
    setAdId("");
    setBackgroundUrl(null);
    setPhoto(null);
    setZoom(1);
    setFocusX(0.5);
    setFocusY(0.5);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show it straight away from the local file, and upload to R2 in the background.
    const localUrl = URL.createObjectURL(file);
    try {
      setPhoto(await loadImage(localUrl));
    } catch {
      alert("Could not read this image.");
      return;
    }
    setBackgroundUrl(null);
    setUploadingBg(true);
    try {
      setBackgroundUrl(await uploadToPosts(file, file.name));
    } catch (err: any) {
      alert(err.message || "Background upload failed");
    } finally {
      setUploadingBg(false);
    }
  };

  const startEditing = async (post: any) => {
    setEditingId(post.id);
    setHeadline(post.headline);
    setBody(post.body || "");
    setRoState(post.roState);
    setAdId(post.adId || "");
    setBackgroundUrl(post.backgroundUrl || null);
    setZoom(1);
    setFocusX(0.5);
    setFocusY(0.5);
    setPhoto(null);
    if (post.backgroundUrl) {
      try {
        setPhoto(await loadImage(post.backgroundUrl));
      } catch {
        /* keep empty photo area */
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSave = async () => {
    if (!headline.trim()) return alert("Please write a headline.");
    if (!roState) return alert("Please choose a Ro-State.");
    if (!photo) return alert("Please upload a background photo.");
    if (!backgroundUrl) return alert("The background is still uploading, try again in a moment.");
    if (layout?.headlineOverflow) return alert("The headline is longer than 3 lines. Please shorten it.");
    if (layout?.bodyTooLong) return alert("The body text is too long for the post. Please shorten it.");
    if (previewError || !canvasRef.current) return alert(previewError || "Preview is not ready.");

    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvasRef.current!.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not create the image");
      const imageUrl = await uploadToPosts(blob, "post.png");

      const payload = { headline, body, logo, roState, adId: adId || null, backgroundUrl, imageUrl };
      const res = await fetch(editingId ? `/api/admin/posts/${editingId}` : "/api/admin/posts", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data.error || "Failed to save post");
      resetForm();
      await loadAll();
      if (data.discordWarning) {
        alert(`The post was saved, but sending it to Discord failed:\n${data.discordWarning}\nUse Resend on the post to try again.`);
      }
    } catch (err: any) {
      alert(err.message || "Failed to save post");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post: any) => {
    if (!confirm("Delete this post?")) return;
    const res = await fetch(`/api/admin/posts/${post.id}`, { method: "DELETE" });
    if (res.ok) {
      if (editingId === post.id) resetForm();
      await loadAll();
    } else {
      alert(((await res.json()) as any).error || "Failed to delete post");
    }
  };

  const handleResend = async (post: any) => {
    const res = await fetch(`/api/admin/posts/${post.id}/resend`, { method: "POST" });
    if (!res.ok) alert(((await res.json()) as any).error || "Failed to resend post");
    await loadAll();
  };

  const handleDecision = async (post: any, decision: "approve" | "deny") => {
    let reason = "";
    if (decision === "deny") {
      reason = (prompt("Reason for denying this post:") || "").trim();
      if (!reason) return;
    }
    const res = await fetch(`/api/admin/posts/${post.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) alert(data.error || "Failed to save decision");
    else if (data.warning) alert(`Saved, but updating the Discord message failed:\n${data.warning}`);
    await loadAll();
  };

  const adOptionLabel = (a: any) =>
    `${a.organizerName}: ${a.title} (${a.impressionsLeft === null ? "unlimited" : `${a.impressionsLeft} left`})`;

  return (
    <AdminAuthGuard requiredPermission={canManagePosts} featureTitle="Posts">
      <div className="container mx-auto max-w-7xl px-4 sm:px-8 pt-24 sm:pt-28 pb-12 space-y-8 text-neutral-900 dark:text-white">
        <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
          </Link>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight flex items-center gap-2.5">
            <Newspaper className="h-7 w-7 text-blue-600 dark:text-blue-400" /> Posts
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="p-6 space-y-4 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none self-start">
            <h2 className="text-lg font-bold">{editingId ? "Edit Post" : "Create Post"}</h2>

            <div>
              <label className={labelClass}>Headline (max 3 lines)</label>
              <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline" />
              {layout?.headlineOverflow && <p className="mt-1 text-[11px] text-red-600">Too long: only 3 lines fit.</p>}
            </div>

            <div>
              <label className={labelClass}>Body</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className={fieldClass} placeholder="Leave a blank line between paragraphs" />
              {layout?.bodyTooLong && <p className="mt-1 text-[11px] text-red-600">Too long for the post.</p>}
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className={labelClass}>Ro-State (required)</label>
                <select value={roState} onChange={(e) => setRoState(e.target.value)} className={fieldClass}>
                  <option value="">Choose...</option>
                  {RO_STATES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Ad</label>
              <div className="flex gap-2">
                <select value={adId} onChange={(e) => setAdId(e.target.value)} className={fieldClass}>
                  <option value="">No ad (&quot;your advertisement here&quot;)</option>
                  {ads.map((a) => (
                    <option key={a.id} value={a.id} disabled={!a.imageUrl.startsWith("/")}>
                      {adOptionLabel(a)}{a.imageUrl.startsWith("/") ? "" : " (re-upload image first)"}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!suggestedAdId}
                  onClick={() => suggestedAdId && setAdId(suggestedAdId)}
                  className="cursor-pointer shrink-0"
                  title="Pick the next ad in rotation"
                >
                  <Shuffle className="h-4 w-4 mr-1.5" /> Auto-pick
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-neutral-500">
                The post uses one of the ad&apos;s impressions. Auto-pick rotates between ads that have impressions left.
              </p>
            </div>

            <div>
              <label className={labelClass}>Background photo</label>
              <div className="flex items-center gap-2">
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleBackground} className="hidden" />
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} className="cursor-pointer">
                  {uploadingBg ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
                  {photo ? "Replace photo" : "Upload photo"}
                </Button>
                {uploadingBg && <span className="text-[11px] text-neutral-500">Uploading in the background...</span>}
              </div>
              {photo && (
                <div className="mt-3 grid grid-cols-3 gap-3 text-[11px] text-neutral-600 dark:text-neutral-400">
                  <label>Zoom<input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" /></label>
                  <label>Left / right<input type="range" min={0} max={1} step={0.01} value={focusX} onChange={(e) => setFocusX(Number(e.target.value))} className="w-full" /></label>
                  <label>Up / down<input type="range" min={0} max={1} step={0.01} value={focusY} onChange={(e) => setFocusY(Number(e.target.value))} className="w-full" /></label>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button type="button" onClick={handleSave} disabled={saving || uploadingBg} className="flex-1 font-semibold bg-[#00a9d2] hover:bg-[#0090b3] text-white cursor-pointer shadow-sm disabled:opacity-50">
                {saving ? "Saving..." : editingId ? "Save Changes" : "Generate Post"}
              </Button>
              <Button type="button" variant="outline" onClick={handleExport} className="cursor-pointer">
                <Download className="h-4 w-4 mr-1.5" /> Export post
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm} className="cursor-pointer">Cancel</Button>
              )}
            </div>
          </Card>

          <div className="space-y-2 lg:sticky lg:top-24 self-start">
            <h2 className="text-lg font-bold">Live preview</h2>
            <canvas ref={canvasRef} width={1024} height={1024} className="w-full max-w-[640px]"
              style={CHECKERBOARD} />
            {previewError && <p className="text-xs text-red-600">{previewError}</p>}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold">All posts</h2>
          {loading ? (
            <div className="flex items-center p-8 text-neutral-500"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading...</div>
          ) : posts.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-neutral-300 dark:border-neutral-800 rounded-lg text-xs text-neutral-500">No posts yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {posts.map((p) => {
                const mine = me?.id === p.createdBy;
                const canChange = mine || isLeadership;
                return (
                  <Card key={p.id} className="p-3 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none space-y-2">
                    <a href={p.imageUrl} target="_blank" rel="noopener noreferrer">
                      <img src={p.imageUrl} alt={p.headline} className="w-full rounded-lg bg-neutral-200 dark:bg-neutral-800" />
                    </a>
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold leading-snug">{p.headline}</h3>
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                        {RO_STATES.find((s) => s.key === p.roState)?.label} · {p.organizationName || "No ad"} · by {p.creatorName || "unknown"}
                      </p>
                      <p className="text-[11px]">
                        <span className={`font-semibold ${STATUS_STYLES[p.status] || ""}`}>{p.status}</span>
                        {p.decidedByLabel ? ` by ${p.decidedByLabel}` : ""}
                        {p.status === "denied" && p.denyReason ? ` — ${p.denyReason}` : ""}
                      </p>
                    </div>
                    {p.status === "pending" && (!p.ftnPlusMessageId || !p.leadershipMessageId) && (
                      <p className="text-[11px] text-red-600">Not fully sent to Discord yet.</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {p.status === "pending" && canChange && (!p.ftnPlusMessageId || !p.leadershipMessageId) && (
                        <Button size="sm" variant="outline" onClick={() => handleResend(p)} className="cursor-pointer">Resend to Discord</Button>
                      )}
                      {p.status === "pending" && isLeadership && (
                        <>
                          <Button size="sm" onClick={() => handleDecision(p, "approve")} className="cursor-pointer"><Check className="h-3.5 w-3.5" /> Approve</Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDecision(p, "deny")} className="cursor-pointer"><X className="h-3.5 w-3.5" /> Deny</Button>
                        </>
                      )}
                      {p.status === "pending" && canChange && (
                        <Button size="sm" variant="outline" onClick={() => startEditing(p)} className="cursor-pointer"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                      )}
                      {canChange && (
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(p)} className="cursor-pointer text-red-600"><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminAuthGuard>
  );
}
