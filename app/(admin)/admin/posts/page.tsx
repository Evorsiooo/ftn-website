"use client";
import { Select } from "@/components/ui/select";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { toast, confirmDialog, promptDialog } from "@/components/gs/dialogs";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Clock, Download, Loader2, MessageSquarePlus, Newspaper, Pencil, Shuffle, Trash2, Upload, X } from "lucide-react";
import { AdminRow, AdminSegmented, AdminSwitch } from "@/components/gs/admin-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader, AdminTab } from "@/components/gs/admin-header";
import { canManagePosts, isPostsLeadership } from "@/lib/rbac";
import { RO_STATES } from "@/lib/ro-states";
import { PostLayers, PostLayout, TEMPLATE, buildPostLayers, loadImage, logoForRoState, renderPost } from "@/lib/post-template";
import { VideoEditor, type VideoEditorHandle } from "@/components/admin/posts/video-editor";

const labelClass = "mb-1 block text-sm font-bold";
const fieldClass =
  "w-full rounded-md border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-3 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

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

const MAX_BACKGROUND_EDGE = 2048;
const BACKGROUND_SKIP_BYTES = 2 * 1024 * 1024;

// Downscale and re-encode big photos in the browser so they stay well under the upload limit.
async function shrinkImage(file: File, img: HTMLImageElement): Promise<File> {
  if (file.type === "image/gif") return file;
  const edge = Math.max(img.naturalWidth, img.naturalHeight);
  if (edge <= MAX_BACKGROUND_EDGE && file.size <= BACKGROUND_SKIP_BYTES) return file;
  const scale = Math.min(1, MAX_BACKGROUND_EDGE / edge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // WebP keeps transparency; browsers without WebP encoding fall back to PNG, so retry as JPEG.
  let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.9));
  if (!blob || blob.type !== "image/webp") blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!blob || blob.size >= file.size) return file;
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type: blob.type });
}

function parseNotes(raw: string | null): string[] {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const pad2 = (n: number) => String(n).padStart(2, "0");
// Local wall-clock value for the date/time picker ("2026-10-28T14:30").
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => new Date(v).getTime();
const formatWhen = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Dropdown value for "No ad" (an empty value is the placeholder).
const NO_AD = "none";

export default function AdminPostsPage() {
  const [me, setMe] = useState<{ id: string; roles: string[] } | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [suggestedAdId, setSuggestedAdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "denied" | "scheduled" | "drafts">("all");

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
  // The selected clip controls sit in the free column left of the preview.
  const [selectedHost, setSelectedHost] = useState<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  // Empty = send to Discord right away; otherwise the local time the post should be sent.
  const [scheduleAt, setScheduleAt] = useState("");
  const [timeEdits, setTimeEdits] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<PostLayout | null>(null);
  const [previewError, setPreviewError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const renderToken = useRef(0);
  const filterTouched = useRef(false);

  const isLeadership = me ? isPostsLeadership(me.roles) : false;

  const loadAll = useCallback(async () => {
    try {
      const [postsRes, optionsRes, sessionRes] = await Promise.all([
        fetch("/api/admin/posts"),
        fetch("/api/admin/posts/options"),
        fetch("/api/auth/session"),
      ]);
      if (postsRes.ok) {
        const list = ((await postsRes.json()) as any).posts || [];
        setPosts(list);
        if (!filterTouched.current && list.some((p: any) => p.status === "pending" && !p.scheduledAt)) setStatusFilter("pending");
      }
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
        toast(err.message || "Could not create the video");
      }
      return;
    }
    if (previewError || !canvasRef.current) return toast(previewError || "Preview is not ready.");
    const blob = await new Promise<Blob | null>((resolve) => canvasRef.current!.toBlob(resolve, "image/png"));
    if (!blob) return toast("Could not create the image");
    const slug = headline.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug || "post"}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const resetForm = () => {
    setViewing(null);
    setEditingId(null);
    setMode("image");
    setTransparent(false);
    videoEditor.current?.reset();
    setHeadline("");
    setBody("");
    setRoState("");
    setAdId("");
    setScheduleAt("");
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
    let img: HTMLImageElement;
    try {
      img = await loadImage(localUrl);
      setPhoto(img);
    } catch {
      toast("Could not read this image.");
      return;
    }
    setBackgroundUrl(null);
    setUploadingBg(true);
    try {
      const upload = await shrinkImage(file, img);
      setBackgroundUrl(await uploadToPosts(upload, upload.name));
    } catch (err: any) {
      toast(err.message || "Background upload failed");
    } finally {
      setUploadingBg(false);
    }
  };

  const startEditing = async (post: any) => {
    setViewing(null);
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
        toast(err.message || "Could not open the video edit");
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

  const handleSave = async (asDraft = false) => {
    if (!headline.trim()) return toast("Please write a headline.");
    if (!roState) return toast("Please choose a Ro-State.");
    if (mode === "image" && !photo) return toast("Please upload a background photo.");
    if (mode === "image" && !backgroundUrl) return toast("The background is still uploading, try again in a moment.");
    if (mode === "video" && !videoEditor.current?.hasVideo()) return toast("Please add a video.");
    if (layout?.headlineOverflow) return toast("The headline is longer than 3 lines. Please shorten it.");
    if (layout?.bodyTooLong) return toast("The body text is too long for the post. Please shorten it.");
    if (previewError || !canvasRef.current) return toast(previewError || "Preview is not ready.");
    if (!asDraft && (!editingId || editingDraft) && scheduleAt && !(fromLocalInput(scheduleAt) > Date.now() + 60_000)) {
      return toast("Choose a publish time in the future, or clear it to send now.");
    }

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
      if (!editingId && asDraft) payload.draft = true;
      if (editingDraft && !asDraft) payload.publish = true;
      if (!asDraft && (!editingId || editingDraft) && scheduleAt) payload.scheduledAt = fromLocalInput(scheduleAt);
      const res = await fetch(editingId ? `/api/admin/posts/${editingId}` : "/api/admin/posts", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data.error || "Failed to save post");
      resetForm();
      await loadAll();
      if (asDraft) toast("Draft saved.");
      if (data.discordWarning) {
        toast(`The post was saved, but sending it to Discord failed:\n${data.discordWarning}\nUse Resend on the post to try again.`);
      }
    } catch (err: any) {
      toast(err.message || "Failed to save post");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post: any) => {
    if (!post.skipConfirm && !await confirmDialog("Delete this post?")) return;
    const res = await fetch(`/api/admin/posts/${post.id}`, { method: "DELETE" });
    if (res.ok) {
      if (editingId === post.id) resetForm();
      await loadAll();
    } else {
      toast(((await res.json()) as any).error || "Failed to delete post");
    }
  };

  const handleAmend = async (post: any) => {
    const note = await promptDialog("Edit note to show under the post in Discord (shown as \"edit: ...\"):");
    if (!note || !note.trim()) return;
    const res = await fetch(`/api/admin/posts/${post.id}/amend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) toast(data.error || "Failed to add the edit note");
    else if (data.discordWarning) toast(`The note was saved, but updating Discord failed:\n${data.discordWarning}`);
    await loadAll();
  };

  const handleCancelSchedule = async (post: any) => {
    if (!await confirmDialog("Cancel this scheduled post? It will be deleted and never sent.")) return;
    await handleDelete({ ...post, skipConfirm: true });
  };

  const handlePublishNow = async (post: any) => {
    const res = await fetch(`/api/admin/posts/${post.id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ now: true }),
    });
    if (!res.ok) toast(((await res.json().catch(() => ({}))) as any).error || "Failed to send the post");
    await loadAll();
  };

  const handleSaveTime = async (post: any) => {
    const value = timeEdits[post.id];
    if (!value) return;
    const at = fromLocalInput(value);
    if (!(at > Date.now() + 60_000)) return toast("Choose a publish time in the future.");
    const res = await fetch(`/api/admin/posts/${post.id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt: at }),
    });
    if (!res.ok) return toast(((await res.json().catch(() => ({}))) as any).error || "Failed to change the time");
    setTimeEdits((m) => {
      const { [post.id]: _, ...rest } = m;
      return rest;
    });
    await loadAll();
  };

  const handleResend = async (post: any) => {
    const res = await fetch(`/api/admin/posts/${post.id}/resend`, { method: "POST" });
    if (!res.ok) toast(((await res.json()) as any).error || "Failed to resend post");
    await loadAll();
  };

  const handleDecision = async (post: any, decision: "approve" | "deny") => {
    let reason = "";
    if (decision === "deny") {
      reason = (await promptDialog("Reason for denying this post:") || "").trim();
      if (!reason) return;
    }
    const res = await fetch(`/api/admin/posts/${post.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) toast(data.error || "Failed to save decision");
    else if (data.warning) toast(`Saved, but updating the Discord message failed:\n${data.warning}`);
    await loadAll();
  };

  const adOptionLabel = (a: any) =>
    `${a.organizerName}: ${a.title} (${a.impressionsLeft === null ? "unlimited" : `${a.impressionsLeft} left`})`;

  const drafts = posts.filter((p) => p.status === "draft");
  const scheduledPosts = posts
    .filter((p) => p.scheduledAt && p.status !== "draft")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const sentPosts = posts.filter((p) => !p.scheduledAt && p.status !== "draft");
  const visiblePosts =
    statusFilter === "scheduled" ? scheduledPosts
    : statusFilter === "drafts" ? drafts
    : statusFilter === "all" ? [...scheduledPosts, ...sentPosts]
    : sentPosts.filter((p) => p.status === statusFilter);
  const filterCount = (f: string) =>
    f === "all" ? scheduledPosts.length + sentPosts.length
    : f === "scheduled" ? scheduledPosts.length
    : f === "drafts" ? drafts.length
    : sentPosts.filter((p) => p.status === f).length;
  const editingDraft = !!editingId && posts.find((p) => p.id === editingId)?.status === "draft";
  const current = editingId ? posts.find((p) => p.id === editingId) : viewing;
  // The preview shrinks with the window so the page never needs a scrollbar. Reserved space: header,
  // the status bar when a post is open, and the timeline in video mode.
  const previewStyle: React.CSSProperties = {
    maxWidth: mode === "video" && !viewing
      ? `clamp(200px, calc(100vh - ${30.25 + (current ? 5 : 0)}rem), 900px)`
      : `clamp(300px, calc(100vh - ${18 + (current ? 5 : 0)}rem), 900px)`,
  };
  const canDecide = !!current && current.status === "pending" && !current.scheduledAt && isLeadership;

  const queueEl = (
    <>
            <div className="mb-3 flex flex-wrap gap-1.5 xl:mb-0 xl:grid xl:w-56 xl:shrink-0 xl:grid-cols-2">
              {(["pending", "approved", "denied", "scheduled", "drafts", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { filterTouched.current = true; setStatusFilter(f); }}
                  className={`cursor-pointer whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${statusFilter === f ? "border-brand bg-brand text-brand-ink" : "border-neutral-300 text-neutral-600 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-400"}`}
                >
                  {f[0].toUpperCase() + f.slice(1)} {filterCount(f)}
                </button>
              ))}
            </div>
            {loading ? (
              <div className="flex flex-1 items-center p-6 text-neutral-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading...</div>
            ) : visiblePosts.length === 0 ? (
              <div className="flex-1 rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">Nothing here.</div>
            ) : (
              <ul className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-1">
                {visiblePosts.map((p) => {
                  const canChange = me?.id === p.createdBy || isLeadership;
                  const selected = (editingId ?? viewing?.id) === p.id;
                  return (
                    <li key={p.id} className={`w-56 shrink-0 rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 ${selected ? "!bg-brand/15" : ""}`}>
                      <button
                        type="button"
                        onClick={() => (canChange && (p.status === "pending" || p.status === "draft") ? startEditing(p) : (resetForm(), setViewing(p)))}
                        className="flex w-full cursor-pointer items-center gap-3 p-3 text-left"
                      >
                        <img src={p.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-neutral-200 object-cover dark:bg-neutral-800" />
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-sm font-bold leading-snug">{p.headline}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
                            {p.scheduledAt ? (
                              <>
                                <Clock className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                                <span className="font-semibold text-sky-600 dark:text-sky-400">{formatWhen(new Date(p.scheduledAt).getTime())}</span>
                              </>
                            ) : (
                              <>
                                <span className={`h-2 w-2 rounded-full ${p.status === "draft" ? "bg-neutral-400" : p.status === "pending" ? "bg-amber-500" : p.status === "approved" ? "bg-emerald-500" : "bg-red-500"}`} />
                                <span className={`font-semibold capitalize ${STATUS_STYLES[p.status] || ""}`}>{p.status}</span>
                              </>
                            )}
                            <span className="truncate">· {p.creatorName || "unknown"}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
    </>
  );

  return (
    <AdminAuthGuard requiredPermission={canManagePosts} featureTitle="Posts">
      <div className="w-full space-y-6 text-neutral-900 dark:text-white xl:space-y-3">
        <AdminPageHeader
          title="Posts"
          description="Preview, details and approval for each post."
          actions={
            <>
              <div className="hidden min-w-0 flex-1 items-center gap-4 xl:flex">{queueEl}</div>
              <Button size="sm" onClick={() => resetForm()} className="h-10 cursor-pointer px-5 text-sm">New post</Button>
            </>
          }
        />

        <div className={`grid grid-cols-1 items-start gap-6 2xl:gap-10 ${mode === "video" && !viewing ? "xl:grid-cols-[minmax(0,1fr)_minmax(26rem,32rem)]" : "xl:grid-cols-[minmax(0,1fr)_minmax(26rem,32rem)]"}`}>
          <section className="min-w-0 xl:hidden">
            {queueEl}
          </section>


          <section className="min-w-0 space-y-3">
            {current && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                <span className={`h-2.5 w-2.5 rounded-full ${current.status === "draft" ? "bg-neutral-400" : current.status === "pending" ? "bg-amber-500" : current.status === "approved" ? "bg-emerald-500" : "bg-red-500"}`} />
                <span className="text-sm font-bold capitalize">{current.status}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">
                  {RO_STATES.find((st) => st.key === current.roState)?.label} · {current.organizationName || "No ad"}
                  {current.decidedByLabel ? ` · by ${current.decidedByLabel}` : ""}
                  {current.status === "denied" && current.denyReason ? ` · ${current.denyReason}` : ""}
                </span>
                {current.scheduledAt && (() => {
                  const whenMs = new Date(current.scheduledAt).getTime();
                  const edit = timeEdits[current.id];
                  const canChangeTime = me?.id === current.createdBy || isLeadership;
                  return (
                    <>
                      <span className="flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400"><Clock className="h-3.5 w-3.5" /> {canChangeTime ? "Sends" : `Sends ${formatWhen(whenMs)}`}</span>
                      {canChangeTime && (
                        <>
                          <div className="w-48"><DateTimeInput type="datetime-local" value={edit ?? toLocalInput(new Date(whenMs))} min={toLocalInput(new Date())} onChange={(e) => setTimeEdits((m) => ({ ...m, [current.id]: e.target.value }))} className={fieldClass} /></div>
                          {edit && edit !== toLocalInput(new Date(whenMs)) && (
                            <Button size="sm" onClick={() => handleSaveTime(current)} className="cursor-pointer">Save time</Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => handlePublishNow(current)} className="cursor-pointer">Publish now</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleCancelSchedule(current)} className="cursor-pointer text-red-600"><X className="h-3.5 w-3.5" /> Cancel</Button>
                        </>
                      )}
                    </>
                  );
                })()}
                {!current.scheduledAt && current.status === "pending" && (me?.id === current.createdBy || isLeadership) && (!current.ftnPlusMessageId || !current.leadershipMessageId) && (
                  <Button size="sm" variant="outline" onClick={() => handleResend(current)} className="cursor-pointer">Resend to Discord</Button>
                )}
                {canDecide && (
                  <>
                    <Button size="sm" onClick={() => handleDecision(current, "approve")} className="cursor-pointer"><Check className="h-3.5 w-3.5" /> Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDecision(current, "deny")} className="cursor-pointer"><X className="h-3.5 w-3.5" /> Deny</Button>
                  </>
                )}
                {current.status !== "denied" && current.status !== "draft" && (me?.id === current.createdBy || isLeadership) && (
                  <Button size="sm" variant="outline" onClick={() => handleAmend(current)} className="cursor-pointer"><MessageSquarePlus className="h-3.5 w-3.5" /> Edit note</Button>
                )}
                {(me?.id === current.createdBy || isLeadership) && (
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(current)} className="cursor-pointer text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                )}
              </div>
            )}
            {viewing && !editingId && (
              <div className="space-y-2">
                {viewing.mediaType === "video" && viewing.videoUrl && !viewing.videoUrl.endsWith(".webp") ? (
                  <video src={viewing.videoUrl} poster={viewing.imageUrl} controls playsInline className="mx-auto w-full rounded-lg bg-neutral-900" style={previewStyle} />
                ) : (
                  <img src={viewing.mediaType === "video" && viewing.videoUrl ? viewing.videoUrl : viewing.imageUrl} alt={viewing.headline} className="mx-auto w-full rounded-lg bg-neutral-200 dark:bg-neutral-800" style={previewStyle} />
                )}
                {parseNotes(viewing.amendments).map((n, i) => <p key={i} className="text-xs italic text-neutral-500">edit: {n}</p>)}
              </div>
            )}
            <div className={viewing && !editingId ? "hidden" : "relative space-y-2"}>
              <div ref={setSelectedHost} className={mode === "video" ? "mb-2 space-y-3 xl:absolute xl:bottom-0 xl:left-0 xl:z-10 xl:mb-0 xl:w-64" : "hidden"} />
              <canvas ref={canvasRef} width={1024} height={1024} className="mx-auto w-full" style={{ ...CHECKERBOARD, ...previewStyle }} />
              {previewError && <p className="text-xs text-red-600">{previewError}</p>}
            </div>
            <div ref={setTimelineHost} className={mode === "video" && !viewing ? "rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950" : "hidden"} />
          </section>

          <section className={`min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 xl:sticky xl:top-20 xl:flex xl:max-h-[calc(100vh_-_16.5rem)] xl:flex-col ${viewing && !editingId ? "opacity-60" : ""}`}>
          <div className="space-y-4 p-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            <h2 className="text-lg font-extrabold">{editingDraft ? "Edit draft" : editingId ? "Edit post" : "New post"}</h2>

            <h3 className="flex items-center gap-2 border-b border-neutral-200 pb-1.5 pt-1 text-sm font-extrabold dark:border-neutral-800"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs text-brand-ink">1</span>Write it</h3>

            <div>
              <label className={labelClass}>Headline (max 3 lines)</label>
              <textarea value={headline} onChange={(e) => setHeadline(e.target.value.replace(/\s*\n+\s*/g, " "))} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} rows={2} className={`${fieldClass} field-sizing-content resize-none`} placeholder="Headline" />
              {layout?.headlineOverflow && <p className="mt-1 text-[11px] text-red-600">Too long: only 3 lines fit.</p>}
            </div>

            <div>
              <label className={labelClass}>Body</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className={fieldClass} placeholder="Leave a blank line between paragraphs" />
              {layout?.bodyTooLong && <p className="mt-1 text-[11px] text-red-600">Too long for the post.</p>}
            </div>

            <h3 className="flex items-center gap-2 border-b border-neutral-200 pb-1.5 pt-1 text-sm font-extrabold dark:border-neutral-800"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs text-brand-ink">2</span>Where it goes</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Ro-State (required)</label>
                <Select value={roState} onChange={(e) => setRoState(e.target.value)} className={fieldClass}>
                  <option value="">Choose...</option>
                  {RO_STATES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Ad</label>
              <div className="flex gap-2">
                <Select value={adId} onChange={(e) => setAdId(e.target.value)} className={`${fieldClass} min-w-0 flex-1`}>
                  <option value="">Placeholder (&quot;your advertisement here&quot;)</option>
                  <option value={NO_AD}>No ad (image cropped to the box)</option>
                  {ads.map((a) => (
                    <option key={a.id} value={a.id} disabled={!a.imageUrl.startsWith("/")}>
                      {adOptionLabel(a)}{a.imageUrl.startsWith("/") ? "" : " (re-upload image first)"}
                    </option>
                  ))}
                </Select>
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

            <h3 className="flex items-center gap-2 border-b border-neutral-200 pb-1.5 pt-1 text-sm font-extrabold dark:border-neutral-800"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs text-brand-ink">3</span>Media</h3>

            <div>
              <label className={labelClass}>Post type</label>
              <AdminSegmented value={mode} onChange={(m) => !editingId && setMode(m)} options={[{ value: "image", label: "Image" }, { value: "video", label: "Video" }]} />
            </div>

            {mode === "video" ? (
              <div>
                <label className={labelClass}>Video</label>
                {openingVideo && <p className="mb-2 text-[11px] text-neutral-500">Opening the saved edit...</p>}
                <div className="mb-3">
                  <AdminRow
                    label="Transparent animated WebP"
                    hint="Keeps the gap above the ad and the rounded corners see-through. No sound, and it takes longer to render. When off, the post is an MP4 with sound on a dark background."
                  >
                    <AdminSwitch checked={transparent} onChange={setTransparent} label="Transparent animated WebP" />
                  </AdminRow>
                </div>
                <VideoEditor ref={videoEditor} canvasRef={canvasRef} layers={videoLayers} animatedWebp={transparent} timelineHost={timelineHost} selectedHost={selectedHost} uploadPoster={(blob) => uploadToPosts(blob, "post.png")} />
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

            {(!editingId || editingDraft) && (
              <div>
                <label className={labelClass}>Publish time (optional)</label>
                <div className="flex flex-wrap gap-2">
                  <DateTimeInput type="datetime-local" value={scheduleAt} min={toLocalInput(new Date())} onChange={(e) => setScheduleAt(e.target.value)} className={fieldClass} placeholder="Send right away" />
                  {scheduleAt && (
                    <Button type="button" variant="outline" onClick={() => setScheduleAt("")} className="cursor-pointer shrink-0">Send now</Button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-neutral-500">
                  {scheduleAt
                    ? "The post is sent to #ftn-plus and #leadership at this time (your local time), then waits for approval as usual."
                    : "Leave empty to send to Discord as soon as the post is generated."}
                </p>
              </div>
            )}

          </div>
          <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => handleSave(false)} disabled={saving || uploadingBg || openingVideo} className="min-w-[10rem] flex-1 font-semibold bg-brand hover:bg-brand-hover text-brand-ink cursor-pointer shadow-sm disabled:opacity-50">
                {saving ? "Saving..." : editingId && !editingDraft ? "Save Changes" : scheduleAt ? "Schedule Post" : "Generate Post"}
              </Button>
              {(!editingId || editingDraft) && (
                <Button type="button" variant="outline" onClick={() => handleSave(true)} disabled={saving || uploadingBg || openingVideo} className="cursor-pointer">
                  Save draft
                </Button>
              )}
              <Button type="button" variant="outline" onClick={handleExport} className="cursor-pointer">
                <Download className="h-4 w-4 mr-1.5" /> {mode === "video" ? "Export video" : "Export post"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm} className="cursor-pointer">Cancel</Button>
              )}
            </div>
          </div>
          </section>
        </div>
      </div>
    </AdminAuthGuard>
  );
}
