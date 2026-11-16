"use client";
import { Select } from "@/components/ui/select";
import { toast, promptDialog } from "@/components/gs/dialogs";
import React, { useState, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Body, Field, PageBar } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Quote, Link as LinkIcon, Image as ImageIcon, Upload, Undo, Redo, Loader2, X } from "lucide-react";

const MAX_ARTICLE_CHARS = 20000;

export interface ArticleData {
  id?: string;
  slug?: string;
  title: string;
  content: string;
  summary?: string;
  category: "news" | "politics" | "business" | "technology" | "entertainment" | "opinion";
  coverImageUrl?: string;
  status: "draft" | "published" | "archived";
}

interface RichTextEditorProps {
  initialArticle?: ArticleData | null;
  onSave: (articleData: ArticleData) => Promise<void>;
  onCancel?: () => void;
  /** Extra buttons for the page bar, such as "History". */
  barActions?: React.ReactNode;
}

/**
 * The article editor as a workspace: page bar with the save buttons, the story on the left,
 * a fixed pane with summary, category and cover on the right. Renders its own PageBar and Body.
 */
export function RichTextEditor({ initialArticle, onSave, onCancel, barActions }: RichTextEditorProps) {
  const [title, setTitle] = useState(initialArticle?.title || "");
  // Empty means "use the opening of the story". A summary that differs from that opening was written by hand.
  const autoOf = (html: string) => {
    const text = html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 220).trim() + (text.length > 220 ? "..." : "");
  };
  const customSummary = (a?: ArticleData | null) => (a?.summary && a.summary !== autoOf(a.content || "") ? a.summary : "");
  const [summaryInput, setSummaryInput] = useState(customSummary(initialArticle));
  const [category, setCategory] = useState<ArticleData["category"]>(initialArticle?.category || "news");
  const [coverImageUrl, setCoverImageUrl] = useState(initialArticle?.coverImageUrl || "");
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingBodyImage, setUploadingBodyImage] = useState(false);
  const [charCount, setCharCount] = useState(0);

  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const bodyFileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "underline font-semibold cursor-pointer",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      ImageExtension.configure({
        HTMLAttributes: {
          class: "rounded-lg max-w-full my-4",
        },
      }),
      Placeholder.configure({
        placeholder: "Write the story here…",
      }),
    ],
    content: initialArticle?.content || "",
    onUpdate: ({ editor }) => {
      setCharCount(editor.getText().length);
    },
    editorProps: {
      attributes: {
        class: "article-prose artws-prose focus:outline-none",
      },
      handleDrop: (view, event, _slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith("image/")) {
            event.preventDefault();
            uploadAndInsertImage(file);
            return true;
          }
        }
        return false;
      },
    },
    immediatelyRender: false,
  });

  // Keep editor content and character count in sync when initialArticle or editor loads
  useEffect(() => {
    if (editor) {
      if (initialArticle) {
        setTitle(initialArticle.title);
        setCategory(initialArticle.category);
        setSummaryInput(customSummary(initialArticle));
        setCoverImageUrl(initialArticle.coverImageUrl || "");
        editor.commands.setContent(initialArticle.content || "");
      }
      setCharCount(editor.getText().length);
    }
  }, [initialArticle, editor]);

  const uploadFileToR2 = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = (await res.json()) as any;
    if (!res.ok) {
      toast(data.error || "The image could not be uploaded.");
      return null;
    }

    return data.url;
  };

  const handleCoverFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCover(true);
    try {
      const url = await uploadFileToR2(file);
      if (url) {
        setCoverImageUrl(url);
      }
    } finally {
      setUploadingCover(false);
      if (coverFileInputRef.current) coverFileInputRef.current.value = "";
    }
  };

  const uploadAndInsertImage = async (file: File) => {
    setUploadingBodyImage(true);
    try {
      const url = await uploadFileToR2(file);
      if (url && editor) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    } finally {
      setUploadingBodyImage(false);
      if (bodyFileInputRef.current) bodyFileInputRef.current.value = "";
    }
  };

  const handleBodyFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadAndInsertImage(file);
  };

  const handleAddLink = async () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = await promptDialog("Link address. Leave it empty to remove the link.", previousUrl || "https://", { ok: "Save link" });
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  const handleAddImageUrl = async () => {
    if (!editor) return;
    const choice = await promptDialog("Image address", "", { ok: "Insert" });
    if (choice && choice.trim()) {
      editor.chain().focus().setImage({ src: choice.trim() }).run();
    }
  };

  const handleSubmit = async (status: "draft" | "published" | "archived") => {
    if (!title.trim()) {
      toast("Give the story a headline first.");
      return;
    }
    const htmlContent = editor?.getHTML() || "";
    const plainText = editor?.getText() || "";

    if (!plainText.trim()) {
      toast("The story is empty.");
      return;
    }

    if (plainText.length > MAX_ARTICLE_CHARS) {
      toast(`The story is too long: ${plainText.length.toLocaleString()} of ${MAX_ARTICLE_CHARS.toLocaleString()} characters.`);
      return;
    }

    const autoSummary = plainText.slice(0, 220).trim() + (plainText.length > 220 ? "..." : "");

    setSaving(true);
    try {
      await onSave({
        id: initialArticle?.id,
        slug: initialArticle?.slug,
        title: title.trim(),
        content: htmlContent,
        summary: summaryInput.trim() || autoSummary,
        category,
        coverImageUrl: coverImageUrl.trim() || undefined,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  const tool = (label: string, icon: React.ReactNode, onClick: () => void, active?: boolean, disabled?: boolean) => (
    <button type="button" className={cn("iconbtn", active && "on")} onClick={onClick} disabled={disabled} title={label} aria-label={label} aria-pressed={active}>
      {icon}
    </button>
  );
  const editing = Boolean(initialArticle?.id);
  const over = charCount > MAX_ARTICLE_CHARS;

  return (
    <>
      <PageBar
        title={editing ? "Edit story" : "New story"}
        crumb={{ href: "/admin/articles", label: "Articles", onClick: onCancel ? (e) => (e.preventDefault(), onCancel()) : undefined }}
        tools={editing ? <span className="t12 muted">Every save is kept in the history.</span> : undefined}
        end={
          <>
            {barActions}
            {editing && (
              <button type="button" className="btn ghost hide-m" disabled={saving} onClick={() => handleSubmit(initialArticle!.status === "archived" ? "published" : "archived")}>
                {initialArticle!.status === "archived" ? "Unarchive" : "Archive"}
              </button>
            )}
            {onCancel && (
              <button type="button" className="btn ghost hide-m" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button type="button" className="btn" disabled={saving} onClick={() => handleSubmit("draft")}>
              Save draft
            </button>
            <button type="button" className="btn primary" disabled={saving} onClick={() => handleSubmit("published")}>
              {saving ? "Saving…" : editing && initialArticle!.status === "published" ? "Update" : "Publish"}
            </button>
          </>
        }
      />
      <Body>
        <div className="artws">
          <div className="artws-main">
            <div className="artws-col">
              <input className="artws-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline" aria-label="Headline" />
              <div className="artws-tools" role="toolbar" aria-label="Formatting">
                {tool("Bold", <Bold className="ic" />, () => editor?.chain().focus().toggleBold().run(), editor?.isActive("bold"))}
                {tool("Italic", <Italic className="ic" />, () => editor?.chain().focus().toggleItalic().run(), editor?.isActive("italic"))}
                <span className="sepv" />
                {tool("Heading 1", <Heading1 className="ic" />, () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), editor?.isActive("heading", { level: 1 }))}
                {tool("Heading 2", <Heading2 className="ic" />, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), editor?.isActive("heading", { level: 2 }))}
                {tool("Heading 3", <Heading3 className="ic" />, () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), editor?.isActive("heading", { level: 3 }))}
                <span className="sepv" />
                {tool("Bullet list", <List className="ic" />, () => editor?.chain().focus().toggleBulletList().run(), editor?.isActive("bulletList"))}
                {tool("Numbered list", <ListOrdered className="ic" />, () => editor?.chain().focus().toggleOrderedList().run(), editor?.isActive("orderedList"))}
                {tool("Quote", <Quote className="ic" />, () => editor?.chain().focus().toggleBlockquote().run(), editor?.isActive("blockquote"))}
                <span className="sepv" />
                {tool("Link", <LinkIcon className="ic" />, handleAddLink, editor?.isActive("link"))}
                <input type="file" ref={bodyFileInputRef} onChange={handleBodyFileUpload} accept="image/jpeg,image/png,image/webp,image/gif" hidden />
                {tool(
                  "Upload an image into the story",
                  uploadingBodyImage ? <Loader2 className="ic spin" /> : <ImageIcon className="ic" />,
                  () => bodyFileInputRef.current?.click(),
                  false,
                  uploadingBodyImage,
                )}
                <button type="button" className="btn sm ghost" onClick={handleAddImageUrl} title="Insert an image from its address">
                  Image link
                </button>
                <span className="sepv" />
                {tool("Undo", <Undo className="ic" />, () => editor?.chain().focus().undo().run(), false, !editor?.can().undo())}
                {tool("Redo", <Redo className="ic" />, () => editor?.chain().focus().redo().run(), false, !editor?.can().redo())}
                <span className={cn("t12 num", over ? "err" : "muted")} style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
                  {charCount.toLocaleString()} / {MAX_ARTICLE_CHARS.toLocaleString()}
                </span>
              </div>
              <EditorContent editor={editor} />
            </div>
          </div>

          <aside className="artws-side">
            <Field label="Summary" help="Shown on the article cards. Leave it empty to use the opening of the story.">
              <textarea className="textarea" value={summaryInput} onChange={(e) => setSummaryInput(e.target.value.slice(0, 300))} rows={4} placeholder="The opening of the story" />
            </Field>
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value as any)} className="select">
                <option value="news">News</option>
                <option value="politics">Politics</option>
                <option value="business">Business</option>
                <option value="technology">Technology</option>
                <option value="entertainment">Entertainment</option>
                <option value="opinion">Opinion</option>
              </Select>
            </Field>
            <Field label="Cover">
              <input type="file" ref={coverFileInputRef} onChange={handleCoverFileUpload} accept="image/jpeg,image/png,image/webp,image/gif" hidden />
              {coverImageUrl && (
                <div style={{ position: "relative" }}>
                  <img src={coverImageUrl} alt="Cover" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 6, border: "1px solid var(--a-border)", display: "block" }} />
                  <button
                    type="button"
                    className="iconbtn"
                    onClick={() => setCoverImageUrl("")}
                    aria-label="Remove cover"
                    title="Remove cover"
                    style={{ position: "absolute", top: 6, right: 6, background: "var(--a-surface)" }}
                  >
                    <X className="ic-sm" />
                  </button>
                </div>
              )}
              <button type="button" className="btn" onClick={() => coverFileInputRef.current?.click()} disabled={uploadingCover}>
                {uploadingCover ? <Loader2 className="ic spin" /> : <Upload className="ic" />}
                {uploadingCover ? "Uploading…" : coverImageUrl ? "Replace cover" : "Upload cover"}
              </button>
              <input className="input sm" value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="Or paste an image address" aria-label="Cover image address" />
            </Field>
            {editing && (
              <div className="show-m" style={{ gap: 8 }}>
                <button type="button" className="btn" disabled={saving} onClick={() => handleSubmit(initialArticle!.status === "archived" ? "published" : "archived")}>
                  {initialArticle!.status === "archived" ? "Unarchive" : "Archive"}
                </button>
                {onCancel && (
                  <button type="button" className="btn ghost" onClick={onCancel}>
                    Cancel
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      </Body>
    </>
  );
}
