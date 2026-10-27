"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Download, Loader2, MessageSquarePlus, Newspaper, Pencil, Shuffle, Trash2, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader, AdminTab } from "@/components/gs/admin-header";
import { canManagePosts, isPostsLeadership } from "@/lib/rbac";
import { RO_STATES } from "@/lib/ro-states";
import { PostLayers, PostLayout, TEMPLATE, buildPostLayers, loadImage, logoForRoState, renderPost } from "@/lib/post-template";
import { VideoEditor, type VideoEditorHandle } from "@/components/admin/posts/video-editor";

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

function parseNotes(raw: string | null): string[] {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Dropdown value for "No ad" (an empty value is the placeholder).
const NO_AD = "none";

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
  const [mode, setMode] = useState<"image" | "video">("image");
  const [videoLayers, setVideoLayers] = useState<PostLayers | null>(null);
  // Transparent animated WebP (no sound) instead of an MP4 on a dark backdrop.
  const [transparent, setTransparent] = useState(false);
  const [openingVideo, setOpeningVideo] = useState(false);
  const videoEditor = useRef<VideoEditorHandle>(null);
  // The video timeline is drawn here, below the form and preview, at full page width.
  const [timelineHost, setTimelineHost] = useState<HTMLDivElement | null>(null);
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

  const noAd = adId === NO_AD;
  const selectedAd = ads.find((a) => a.id === adId) || null;
  const logo = logoForRoState(roState);

  // Live preview: redraw the canvas whenever an input changes.
  useEffect(() => {
    const token = ++renderToken.current;
    (async () => {
      try {
        const adImg = selectedAd ? await loadImage(selectedAd.imageUrl) : null;
        if (!canvasRef.current || token !== renderToken.current) return;
        if (mode === "video") {
          // The video editor draws the frames; it only needs the template layers.
          const layers = await buildPostLayers({ headline, body, logo, ad: adImg, noAd }, transparent ? null : TEMPLATE.videoBackdrop);
          if (token === renderToken.current) {
            setVideoLayers(layers);
            setLayout(layers.layout);
            setPreviewError("");
          }
          return;
        }
        const result = await renderPost(canvasRef.current, {
          headline,
          body,
          photo,
          photoZoom: zoom,
          photoFocusX: focusX,
          photoFocusY: focusY,
          logo,
          ad: adImg,
          noAd,
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
  }, [headline, body, photo, zoom, focusX, focusY, logo, selectedAd, noAd, mode, transparent]);

  // Downloads the image as it is now, without saving the post or using an ad impression.
  const handleExport = async () => {
    if (mode === "video") {
      try {
        const slug = headline.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
        await videoEditor.current?.downloadVideo(slug);
      } catch (err: any) {
        alert(err.message || "Could not create the video");
      }
      return;
    }
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
    setMode("image");
    setTransparent(false);
    videoEditor.current?.reset();
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
    setMode(post.mediaType === "video" ? "video" : "image");
    setTransparent(typeof post.videoUrl === "string" && post.videoUrl.endsWith(".webp"));
    setHeadline(post.headline);
    setBody(post.body || "");
    setRoState(post.roState);
    setAdId(post.noAd ? NO_AD : post.adId || "");
    setBackgroundUrl(post.backgroundUrl || null);
    setZoom(1);
    setFocusX(0.5);
    setFocusY(0.5);
    setPhoto(null);
    if (post.mediaType === "video") {
      setBackgroundUrl(null);
      setOpeningVideo(true);
      try {
        // The editor mounts on the next render.
        for (let i = 0; i < 50 && !videoEditor.current; i++) await new Promise((resolve) => setTimeout(resolve, 20));
        await videoEditor.current?.loadFromPost(post);
      } catch (err: any) {
        alert(err.message || "Could not open the video edit");
      } finally {
        setOpeningVideo(false);
      }
    } else if (post.backgroundUrl) {
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
    if (mode === "image" && !photo) return alert("Please upload a background photo.");
    if (mode === "image" && !backgroundUrl) return alert("The background is still uploading, try again in a moment.");
    if (mode === "video" && !videoEditor.current?.hasVideo()) return alert("Please add a video.");
    if (layout?.headlineOverflow) return alert("The headline is longer than 3 lines. Please shorten it.");
    if (layout?.bodyTooLong) return alert("The body text is too long for the post. Please shorten it.");
    if (previewError || !canvasRef.current) return alert(previewError || "Preview is not ready.");

    setSaving(true);
    try {
      let payload: Record<string, unknown>;
      if (mode === "video") {
        // Renders the video in this browser, then uploads it with a still image of it.
        const saved = await videoEditor.current!.prepareSave();
        payload = {
          headline, body, logo, roState, adId: noAd ? null : adId || null, noAd, backgroundUrl: null,
          mediaType: "video", imageUrl: saved.imageUrl, videoUrl: saved.videoUrl, videoEdit: saved.videoEdit,
        };
      } else {
        const blob = await new Promise<Blob | null>((resolve) => canvasRef.current!.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Could not create the image");
        const imageUrl = await uploadToPosts(blob, "post.png");
        payload = { headline, body, logo, roState, adId: noAd ? null : adId || null, noAd, backgroundUrl, imageUrl, mediaType: "image" };
      }
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

  const handleAmend = async (post: any) => {
    const note = window.prompt("Edit note to show under the post in Discord (shown as \"edit: ...\"):");
    if (!note || !note.trim()) return;
    const res = await fetch(`/api/admin/posts/${post.id}/amend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) alert(data.error || "Failed to add the edit note");
    else if (data.discordWarning) alert(`The note was saved, but updating Discord failed:\n${data.discordWarning}`);
    await loadAll();
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
      <div className="mx-auto w-full max-w-[1500px] space-y-8 text-neutral-900 dark:text-white">
        <AdminPageHeader title="Posts" description="Design news posts with an ad, send them for approval and track them." />

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,min(46vw,820px))] gap-8 xl:gap-10">
          <Card className="p-5 sm:p-6 space-y-4 rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 self-start lg:sticky lg:top-24">
            <h2 className="text-lg font-extrabold">{editingId ? "Edit Post" : "Create Post"}</h2>

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <option value="">Placeholder (&quot;your advertisement here&quot;)</option>
                  <option value={NO_AD}>No ad (image cropped to the box)</option>
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
              <label className={labelClass}>Post type</label>
              <div className="inline-flex rounded-md border border-neutral-300 dark:border-neutral-800 overflow-hidden text-xs font-semibold">
                {(["image", "video"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!!editingId}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 cursor-pointer disabled:cursor-default ${mode === m ? "bg-brand text-brand-ink" : "bg-neutral-50 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300"}`}
                  >
                    {m === "image" ? "Image" : "Video"}
                  </button>
                ))}
              </div>
            </div>

            {mode === "video" ? (
              <div>
                <label className={labelClass}>Video</label>
                {openingVideo && <p className="mb-2 text-[11px] text-neutral-500">Opening the saved edit...</p>}
                <label className="mb-2 flex items-start gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                  <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} className="mt-0.5" />
                  <span>
                    Transparent animated WebP
                    <span className="block text-[11px] text-neutral-500">
                      Keeps the gap above the ad and the rounded corners see-through. <b>No sound</b>: songs and clip volume are left out. Takes longer to render. When off, the post is an MP4 with sound on a dark background.
                    </span>
                  </span>
                </label>
                <VideoEditor ref={videoEditor} canvasRef={canvasRef} layers={videoLayers} animatedWebp={transparent} timelineHost={timelineHost} uploadPoster={(blob) => uploadToPosts(blob, "post.png")} />
              </div>
            ) : (
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
            )}

            <div className="flex gap-2">
              <Button type="button" onClick={handleSave} disabled={saving || uploadingBg || openingVideo} className="flex-1 font-semibold bg-brand hover:bg-brand-hover text-brand-ink cursor-pointer shadow-sm disabled:opacity-50">
                {saving ? "Saving..." : editingId ? "Save Changes" : "Generate Post"}
              </Button>
              <Button type="button" variant="outline" onClick={handleExport} className="cursor-pointer">
                <Download className="h-4 w-4 mr-1.5" /> {mode === "video" ? "Export video" : "Export post"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm} className="cursor-pointer">Cancel</Button>
              )}
            </div>
          </Card>

          <div className="space-y-2 xl:sticky xl:top-24 self-start">
            <h2 className="text-lg font-extrabold">Live preview</h2>
            <canvas ref={canvasRef} width={1024} height={1024} className="w-full max-w-[820px]"
              style={CHECKERBOARD} />
            {previewError && <p className="text-xs text-red-600">{previewError}</p>}
          </div>
        </div>

        <div ref={setTimelineHost} className={mode === "video" ? "rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950" : "hidden"} />

        <div className="space-y-4">
          <h2 className="text-lg font-extrabold">All posts</h2>
          {loading ? (
            <div className="flex items-center p-8 text-neutral-500"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading...</div>
          ) : posts.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-neutral-300 dark:border-neutral-800 rounded-lg text-xs text-neutral-500">No posts yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {posts.map((p) => {
                const mine = me?.id === p.createdBy;
                const canChange = mine || isLeadership;
                return (
                  <Card key={p.id} className="p-3 rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 space-y-2">
                    {p.mediaType === "video" && p.videoUrl?.endsWith(".webp") ? (
                      <img src={p.videoUrl} alt={p.headline} className="w-full rounded-lg bg-neutral-200 dark:bg-neutral-800" />
                    ) : p.mediaType === "video" && p.videoUrl ? (
                      <video src={p.videoUrl} poster={p.imageUrl} controls preload="none" playsInline className="w-full rounded-lg bg-neutral-900" />
                    ) : (
                      <a href={p.imageUrl} target="_blank" rel="noopener noreferrer">
                        <img src={p.imageUrl} alt={p.headline} className="w-full rounded-lg bg-neutral-200 dark:bg-neutral-800" />
                      </a>
                    )}
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
                    {parseNotes(p.amendments).map((n, i) => (
                      <p key={i} className="text-[11px] italic text-neutral-500">edit: {n}</p>
                    ))}
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
                      {p.status !== "denied" && canChange && (
                        <Button size="sm" variant="outline" onClick={() => handleAmend(p)} className="cursor-pointer"><MessageSquarePlus className="h-3.5 w-3.5" /> Add edit note</Button>
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
