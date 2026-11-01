"use client";
import { Select } from "@/components/ui/select";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2, Shuffle, Upload } from "lucide-react";
import { AdminRow, AdminSegmented, AdminSwitch } from "@/components/gs/admin-form";
import { Button } from "@/components/ui/button";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { canManagePosts } from "@/lib/rbac";
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

const pad2 = (n: number) => String(n).padStart(2, "0");
// Local wall-clock value for the date/time picker ("2026-10-28T14:30").
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => new Date(v).getTime();

// Dropdown value for "No ad" (an empty value is the placeholder).
const NO_AD = "none";

export function PostCreator({ editId }: { editId: string | null }) {
  const router = useRouter();
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
  // The selected clip controls sit in the free column left of the preview.
  const [selectedHost, setSelectedHost] = useState<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  // Empty = send to Discord right away; otherwise the local time the post should be sent.
  const [scheduleAt, setScheduleAt] = useState("");
  const [layout, setLayout] = useState<PostLayout | null>(null);
  const [previewError, setPreviewError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const renderToken = useRef(0);
  const openedEdit = useRef(false);

  const loadAll = useCallback(async () => {
    try {
      const [postsRes, optionsRes] = await Promise.all([fetch("/api/admin/posts"), fetch("/api/admin/posts/options")]);
      if (postsRes.ok) setPosts(((await postsRes.json()) as any).posts || []);
      if (optionsRes.ok) {
        const data = (await optionsRes.json()) as any;
        setAds(data.ads || []);
        setSuggestedAdId(data.suggestedAdId || null);
      }
    } catch (err) {
      console.error("Failed to load the creator:", err);
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
      const wasEditing = !!editingId;
      resetForm();
      await loadAll();
      if (data.discordWarning) {
        toast(`The post was saved, but sending it to Discord failed:\n${data.discordWarning}\nUse Resend on the post to try again.`);
        router.push("/admin/posts");
        return;
      }
      if (wasEditing) {
        router.push("/admin/posts");
        return;
      }
      toast(asDraft ? "Draft saved." : scheduleAt ? "Post scheduled." : "Post generated and sent to Discord.");
    } catch (err: any) {
      toast(err.message || "Failed to save post");
    } finally {
      setSaving(false);
    }
  };

  const adOptionLabel = (a: any) =>
    `${a.organizerName}: ${a.title} (${a.impressionsLeft === null ? "unlimited" : `${a.impressionsLeft} left`})`;

  const editingDraft = !!editingId && posts.find((p) => p.id === editingId)?.status === "draft";
  const dirty = !!(headline.trim() || body.trim() || photo || videoEditor.current?.hasVideo());

  // Open the post named in the address (?edit=...) once the list has loaded.
  useEffect(() => {
    if (!editId || openedEdit.current || loading) return;
    openedEdit.current = true;
    const post = posts.find((p) => p.id === editId);
    if (!post || (post.status !== "pending" && post.status !== "draft")) {
      toast("This post can no longer be edited here.");
      router.replace("/admin/posts");
      return;
    }
    startEditing(post);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, loading, posts]);

  const leave = async () => {
    if (dirty && !saving && !(await confirmDialog("Leave the creator? Anything you haven't saved will be lost."))) return;
    router.push("/admin/posts");
  };

  // The preview fills the free height: the top bar, the page padding and, in video mode, the timeline.
  const previewStyle: React.CSSProperties = {
    maxWidth: mode === "video" ? "clamp(200px, calc(100dvh - 22rem), 1024px)" : "clamp(300px, calc(100dvh - 6rem), 1024px)",
  };

  return (
    <AdminAuthGuard requiredPermission={canManagePosts} featureTitle="Posts">
      <div className="gs flex min-h-dvh flex-col text-neutral-900 dark:text-white xl:h-dvh xl:overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white/70 px-4 dark:border-neutral-800 dark:bg-neutral-950/70">
          <button type="button" onClick={leave} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm font-bold transition hover:border-neutral-500 dark:border-neutral-700">
            <ArrowLeft className="h-4 w-4" /> Back to posts
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold">
            Creator <span className="font-semibold text-neutral-500">· {editingDraft ? "Edit draft" : editingId ? "Edit post" : "New post"}</span>
          </h1>
        </header>

        <div className="grid min-h-0 w-full flex-1 grid-cols-1 items-start gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,34rem)] xl:items-stretch">
          <section className="min-w-0 space-y-3 xl:overflow-y-auto">
            <div className="relative space-y-2">
              <div ref={setSelectedHost} className={mode === "video" ? "mb-2 space-y-3 xl:absolute xl:bottom-0 xl:left-0 xl:z-10 xl:mb-0 xl:w-64" : "hidden"} />
              <canvas ref={canvasRef} width={1024} height={1024} className="mx-auto w-full" style={{ ...CHECKERBOARD, ...previewStyle }} />
              {previewError && <p className="text-xs text-red-600">{previewError}</p>}
            </div>
            <div ref={setTimelineHost} className={mode === "video" ? "rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950" : "hidden"} />
          </section>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 xl:flex xl:min-h-0 xl:flex-col">
          <div className="space-y-4 p-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
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
                <Button type="button" variant="outline" onClick={leave} className="cursor-pointer">Cancel</Button>
              )}
            </div>
          </div>
          </section>
        </div>
      </div>
    </AdminAuthGuard>
  );
}
