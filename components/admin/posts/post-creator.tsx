"use client";
import { Select } from "@/components/ui/select";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Shuffle, Upload } from "lucide-react";
import { Body, DT_CLASS, Field, Line, PageBar, Screen, Seg, Switch } from "@/components/admin/ui";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { canManagePosts } from "@/lib/rbac";
import { RO_STATES } from "@/lib/ro-states";
import { PostLayers, PostLayout, TEMPLATE, buildPostLayers, loadImage, logoForRoState, renderPost } from "@/lib/post-template";
import { VideoEditor, type VideoEditorHandle } from "@/components/admin/posts/video-editor";
import { RadioClipCreator } from "@/components/admin/posts/radio-clips/radio-clip-creator";
import { parseRadioClipEdit } from "@/lib/radio-clips/model";

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
  const [mode, setMode] = useState<"image" | "video" | "radio">("image");
  // A saved radio clip being changed (it opens in the Radio clip tab).
  const [radioPost, setRadioPost] = useState<any | null>(null);
  const [videoLayers, setVideoLayers] = useState<PostLayers | null>(null);
  // Transparent animated WebP (no sound) instead of an MP4 on a dark backdrop.
  const [transparent, setTransparent] = useState(false);
  const [openingVideo, setOpeningVideo] = useState(false);
  const videoEditor = useRef<VideoEditorHandle>(null);
  // The video timeline is drawn here, below the form and preview, at full page width.
  // The selected clip controls sit in the free column left of the preview.
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
          setPreviewError(selectedAd ? "This ad's image can't be used on a post. Re-upload it from the Advertisements page." : err?.message || "Preview failed");
        }
      }
    })();
  }, [headline, body, photo, zoom, focusX, focusY, logo, selectedAd, noAd, mode, transparent]);

  // Downloads the image as it is now, without saving the post or using an ad impression.
  const handleExport = async () => {
    if (mode === "video") {
      try {
        const slug = headline
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 50);
        await videoEditor.current?.downloadVideo(slug);
      } catch (err: any) {
        toast(err.message || "Could not create the video");
      }
      return;
    }
    if (previewError || !canvasRef.current) return toast(previewError || "Preview is not ready.");
    const blob = await new Promise<Blob | null>((resolve) => canvasRef.current!.toBlob(resolve, "image/png"));
    if (!blob) return toast("Could not create the image");
    const slug = headline
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
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
    if (post.mediaType === "video" && parseRadioClipEdit(post.videoEdit)) {
      setRadioPost(post);
      setMode("radio");
      return;
    }
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
    if (!asDraft && (!editingId || editingDraft) && when === "later" && !scheduleAt) return toast("Pick when the post should go out, or choose Right away.");
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
          headline,
          body,
          logo,
          roState,
          adId: noAd ? null : adId || null,
          noAd,
          backgroundUrl: null,
          mediaType: "video",
          imageUrl: saved.imageUrl,
          videoUrl: saved.videoUrl,
          videoEdit: saved.videoEdit,
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

  const adOptionLabel = (a: any) => `${a.organizerName}: ${a.title} (${a.impressionsLeft === null ? "unlimited" : `${a.impressionsLeft} left`})`;

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

  const saveLabel = saving ? "Saving…" : editingId && !editingDraft ? "Save changes" : scheduleAt ? "Schedule post" : "Send for approval";
  const canSchedule = !editingId || editingDraft;
  const busy = saving || uploadingBg || openingVideo;
  const [when, setWhen] = useState<"now" | "later">("now");
  useEffect(() => {
    if (scheduleAt) setWhen("later");
  }, [scheduleAt]);
  const headlineLines = layout?.headlineLines?.filter((l) => l.trim()).length ?? 0;

  if (mode === "radio") {
    return (
      <AdminAuthGuard requiredPermission={canManagePosts} featureTitle="Posts">
        <RadioClipCreator
          seg={
            <Seg
              value={mode}
              onChange={(m) => !editingId && setMode(m)}
              options={[
                { value: "image", label: "Image", disabled: !!editingId },
                { value: "video", label: "Video", disabled: !!editingId },
                { value: "radio", label: "Radio clip" },
              ]}
              label="Post type"
            />
          }
          leave={() => router.push("/admin/posts")}
          ads={ads}
          suggestedAdId={suggestedAdId}
          editPost={radioPost}
          uploadPoster={(blob) => uploadToPosts(blob, "post.png")}
        />
      </AdminAuthGuard>
    );
  }

  return (
    <AdminAuthGuard requiredPermission={canManagePosts} featureTitle="Posts">
      <Screen>
        <PageBar
          crumb={{
            href: "/admin/posts",
            label: "Posts",
            onClick: (e) => {
              e.preventDefault();
              leave();
            },
          }}
          title={editingDraft ? "Edit draft" : editingId ? "Edit post" : "New post"}
          tools={
            <Seg
              value={mode}
              onChange={(m) => !editingId && setMode(m)}
              options={[
                { value: "image", label: "Image", disabled: !!editingId && mode !== "image" },
                { value: "video", label: "Video", disabled: !!editingId && mode !== "video" },
                { value: "radio", label: "Radio clip", disabled: !!editingId },
              ]}
              label="Post type"
            />
          }
          end={
            <>
              {editingId && (
                <button type="button" className="btn ghost hide-m" onClick={leave}>
                  Cancel
                </button>
              )}
              {canSchedule && (
                <button type="button" className="btn ghost hide-m" onClick={() => handleSave(true)} disabled={busy}>
                  Save draft
                </button>
              )}
              {mode === "video" && (
                <Select
                  value={transparent ? "webp" : "mp4"}
                  onChange={(e) => setTransparent(e.target.value === "webp")}
                  className="select hide-m"
                  style={{ width: 196 }}
                  aria-label="Video format"
                  title="MP4: with sound, on a dark background. Transparent WebP: no sound, the gap above the ad and the rounded corners stay see-through, slower to render."
                >
                  <option value="mp4">MP4 with sound</option>
                  <option value="webp">Transparent WebP</option>
                </Select>
              )}
              <button type="button" className="btn has-lbl-m" onClick={handleExport} aria-label={mode === "video" ? "Download video" : "Download image"} title="Download without saving">
                <Download className="ic" />
                <span className="lbl-m">Download</span>
              </button>
              <button type="button" className="btn primary lg hide-m" onClick={() => handleSave(false)} disabled={busy}>
                {saveLabel}
              </button>
            </>
          }
          mrow={
            <>
              <Seg
                value={mode}
                onChange={(m) => !editingId && setMode(m)}
                options={[
                  { value: "image", label: "Image", disabled: !!editingId && mode !== "image" },
                  { value: "video", label: "Video", disabled: !!editingId && mode !== "video" },
                  { value: "radio", label: "Radio clip", disabled: !!editingId },
                ]}
                label="Post type"
              />
              {mode === "video" && (
                <select
                  className="select sm"
                  style={{ flex: 1, minWidth: 0 }}
                  value={transparent ? "webp" : "mp4"}
                  onChange={(e) => setTransparent(e.target.value === "webp")}
                  aria-label="Video format"
                >
                  <option value="mp4">MP4 with sound</option>
                  <option value="webp">Transparent WebP</option>
                </select>
              )}
            </>
          }
        />
        <Body>
          <div className={mode === "video" ? "creator video" : "creator"}>
            <div className="stage">
              <canvas ref={canvasRef} width={1024} height={1024} />
              {previewError && <div className="err">{previewError}</div>}
              {openingVideo && <div className="help">Opening the saved edit…</div>}
            </div>

            <div className="creator-form">
              <Field
                label={
                  <span style={{ display: "flex", justifyContent: "space-between" }}>
                    Headline
                    <span className={layout?.headlineOverflow ? "err" : "help"} style={{ fontWeight: 400 }}>
                      {layout?.headlineOverflow ? "Too long: only 3 lines fit" : `${headlineLines} of 3 lines`}
                    </span>
                  </span>
                }
              >
                <textarea
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value.replace(/\s*\n+\s*/g, " "))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  rows={2}
                  className="textarea field-sizing-content"
                  style={{ resize: "none" }}
                  placeholder="What happened"
                />
              </Field>

              <Field label="Body" error={layout?.bodyTooLong ? "Too long for the post." : undefined} help="Leave a blank line between paragraphs.">
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="textarea" />
              </Field>

              <Field label="Ro-State">
                <div className="states" role="radiogroup" aria-label="Ro-State">
                  {RO_STATES.map((s) => (
                    <button key={s.key} type="button" role="radio" aria-checked={roState === s.key} className={roState === s.key ? "on" : ""} onClick={() => setRoState(s.key)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Ad" help="The post uses one of the ad's impressions. Auto picks the next ad in rotation.">
                <div style={{ display: "flex", gap: 8 }}>
                  <Select value={adId} onChange={(e) => setAdId(e.target.value)} className="select h-9 min-w-0 flex-1" aria-label="Ad">
                    <option value="">Placeholder (&quot;your advertisement here&quot;)</option>
                    <option value={NO_AD}>No ad (image cropped to the box)</option>
                    {ads.map((a) => (
                      <option key={a.id} value={a.id} disabled={!a.imageUrl.startsWith("/")}>
                        {adOptionLabel(a)}
                        {a.imageUrl.startsWith("/") ? "" : " (re-upload image first)"}
                      </option>
                    ))}
                  </Select>
                  <button type="button" className="btn" disabled={!suggestedAdId} onClick={() => suggestedAdId && setAdId(suggestedAdId)} title="Pick the next ad in rotation">
                    <Shuffle className="ic" /> Auto
                  </button>
                </div>
              </Field>

              {mode === "image" && (
                <Field label="Background">
                  <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleBackground} className="hidden" />
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {photo ? <img src={photo.src} alt="" className="thumb" style={{ width: 48, height: 48 }} /> : null}
                    <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
                      {uploadingBg ? <Loader2 className="ic spin" /> : <Upload className="ic" />}
                      {photo ? "Replace" : "Upload photo"}
                    </button>
                    {uploadingBg && <span className="help">Uploading in the background…</span>}
                  </div>
                  {photo && (
                    <div className="three" style={{ marginTop: 4 }}>
                      <label className="help">
                        Zoom
                        <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="range" />
                      </label>
                      <label className="help">
                        Left / right
                        <input type="range" min={0} max={1} step={0.01} value={focusX} onChange={(e) => setFocusX(Number(e.target.value))} className="range" />
                      </label>
                      <label className="help">
                        Up / down
                        <input type="range" min={0} max={1} step={0.01} value={focusY} onChange={(e) => setFocusY(Number(e.target.value))} className="range" />
                      </label>
                    </div>
                  )}
                </Field>
              )}

              {canSchedule && (
                <Field
                  label="When"
                  help={
                    when === "later"
                      ? "Sent to #ftn-plus and #leadership at this time (your local time), then it waits for approval as usual."
                      : "Sent to Discord for approval as soon as you press Send."
                  }
                >
                  <Seg
                    value={when}
                    onChange={(v) => {
                      setWhen(v);
                      if (v === "now") setScheduleAt("");
                    }}
                    options={[
                      { value: "now", label: "Right away" },
                      { value: "later", label: "Later" },
                    ]}
                    label="When"
                  />
                  {when === "later" && (
                    <DateTimeInput
                      type="datetime-local"
                      value={scheduleAt}
                      min={toLocalInput(new Date())}
                      onChange={(e) => setScheduleAt(e.target.value)}
                      className={DT_CLASS}
                      placeholder="Pick a date and time"
                    />
                  )}
                </Field>
              )}
            </div>

            {mode === "video" && (
              <div className="vdock-host">
                <VideoEditor ref={videoEditor} canvasRef={canvasRef} layers={videoLayers} animatedWebp={transparent} uploadPoster={(blob) => uploadToPosts(blob, "post.png")} />
              </div>
            )}
          </div>
          <div className="creator-send">
            {canSchedule && (
              <button type="button" className="btn" onClick={() => handleSave(true)} disabled={busy}>
                Save draft
              </button>
            )}
            <button type="button" className="btn primary" onClick={() => handleSave(false)} disabled={busy}>
              {saveLabel}
            </button>
          </div>
        </Body>
      </Screen>
    </AdminAuthGuard>
  );
}
