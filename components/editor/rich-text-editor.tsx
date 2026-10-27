"use client";
import { toast, promptDialog } from "@/components/gs/dialogs";
import React, { useState, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Upload,
  Undo,
  Redo,
  Loader2,
} from "lucide-react";

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
}

export function RichTextEditor({
  initialArticle,
  onSave,
  onCancel,
}: RichTextEditorProps) {
  const [title, setTitle] = useState(initialArticle?.title || "");
  // Empty means "use the opening of the story". A summary that differs from that opening was written by hand.
  const autoOf = (html: string) => {
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return text.slice(0, 220).trim() + (text.length > 220 ? "..." : "");
  };
  const customSummary = (a?: ArticleData | null) => (a?.summary && a.summary !== autoOf(a.content || "") ? a.summary : "");
  const [summaryInput, setSummaryInput] = useState(customSummary(initialArticle));
  const [category, setCategory] = useState<ArticleData["category"]>(
    initialArticle?.category || "news"
  );
  const [coverImageUrl, setCoverImageUrl] = useState(
    initialArticle?.coverImageUrl || ""
  );
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
          class: "text-brand-text underline font-semibold cursor-pointer",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      ImageExtension.configure({
        HTMLAttributes: {
          class: "rounded-xl max-w-full my-4 border border-neutral-800",
        },
      }),
      Placeholder.configure({
        placeholder: "Write your investigative story or report here...",
      }),
    ],
    content: initialArticle?.content || "",
    onUpdate: ({ editor }) => {
      setCharCount(editor.getText().length);
    },
    editorProps: {
      attributes: {
        class: "article-prose min-h-[320px] p-5 focus:outline-none",
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
      toast(`Upload Error: ${data.error || "Failed to upload image"}`);
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
    const url = await promptDialog("Enter website link URL:", previousUrl || "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  const handleAddImageUrl = async () => {
    if (!editor) return;
    const choice = await promptDialog("Enter Image URL, or leave blank and click 'Upload Image' on the toolbar:");
    if (choice && choice.trim()) {
      editor.chain().focus().setImage({ src: choice.trim() }).run();
    }
  };

  const handleSubmit = async (status: "draft" | "published" | "archived") => {
    if (!title.trim()) {
      toast("Please provide an article headline/title.");
      return;
    }
    const htmlContent = editor?.getHTML() || "";
    const plainText = editor?.getText() || "";

    if (!plainText.trim()) {
      toast("Article body cannot be empty.");
      return;
    }

    if (plainText.length > MAX_ARTICLE_CHARS) {
      toast(`Article exceeds character limit (${plainText.length}/${MAX_ARTICLE_CHARS}).`);
      return;
    }

    const autoSummary =
      plainText.slice(0, 220).trim() + (plainText.length > 220 ? "..." : "");

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

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <Card className="p-6 sm:p-8 space-y-6 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none text-neutral-900 dark:text-white">
      {/* Title */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
          Headline
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter article headline..."
          className="text-lg font-bold"
        />
      </div>

      {/* TipTap Editor Toolbar & Surface */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
            Story Body
          </label>
          <span
            className={`text-[11px] font-mono ${
              charCount > MAX_ARTICLE_CHARS
                ? "text-red-500 font-bold"
                : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            {charCount.toLocaleString()} / {MAX_ARTICLE_CHARS.toLocaleString()} characters
          </span>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-1 p-2 bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBold().run()}
              className={`p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer ${
                editor?.isActive("bold") ? "bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white font-bold" : ""
              }`}
              title="Bold"
            >
              <Bold className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              className={`p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer ${
                editor?.isActive("italic") ? "bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white" : ""
              }`}
              title="Italic"
            >
              <Italic className="h-4 w-4" />
            </button>

            <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-800 mx-1" />

            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
              className={`p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer ${
                editor?.isActive("heading", { level: 1 }) ? "bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white" : ""
              }`}
              title="Heading 1"
            >
              <Heading1 className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer ${
                editor?.isActive("heading", { level: 2 }) ? "bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white" : ""
              }`}
              title="Heading 2"
            >
              <Heading2 className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
              className={`p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer ${
                editor?.isActive("heading", { level: 3 }) ? "bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white" : ""
              }`}
              title="Heading 3"
            >
              <Heading3 className="h-4 w-4" />
            </button>

            <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-800 mx-1" />

            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              className={`p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer ${
                editor?.isActive("bulletList") ? "bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white" : ""
              }`}
              title="Bullet List"
            >
              <List className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              className={`p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer ${
                editor?.isActive("orderedList") ? "bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white" : ""
              }`}
              title="Numbered List"
            >
              <ListOrdered className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              className={`p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer ${
                editor?.isActive("blockquote") ? "bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white" : ""
              }`}
              title="Quote"
            >
              <Quote className="h-4 w-4" />
            </button>

            <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-800 mx-1" />

            <button
              type="button"
              onClick={handleAddLink}
              className={`p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer ${
                editor?.isActive("link") ? "bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white" : ""
              }`}
              title="Add Link"
            >
              <LinkIcon className="h-4 w-4" />
            </button>

            {/* Upload Body Image Button */}
            <input
              type="file"
              ref={bodyFileInputRef}
              onChange={handleBodyFileUpload}
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => bodyFileInputRef.current?.click()}
              disabled={uploadingBodyImage}
              className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer inline-flex items-center gap-1"
              title="Upload & Insert Image to Body"
            >
              {uploadingBodyImage ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand-text" />
              ) : (
                <ImageIcon className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={handleAddImageUrl}
              className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white text-xs cursor-pointer"
              title="Insert Image by URL"
            >
              URL
            </button>

            <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-800 mx-1" />

            <button
              type="button"
              onClick={() => editor?.chain().focus().undo().run()}
              disabled={!editor?.can().undo()}
              className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white disabled:opacity-30 cursor-pointer"
              title="Undo"
            >
              <Undo className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => editor?.chain().focus().redo().run()}
              disabled={!editor?.can().redo()}
              className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white disabled:opacity-30 cursor-pointer"
              title="Redo"
            >
              <Redo className="h-4 w-4" />
            </button>
          </div>

          {/* Editor Content Surface */}
          <EditorContent editor={editor} />
        </div>
      </div>

    </Card>
    <aside className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white lg:sticky lg:top-24">
      <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">
        {initialArticle?.id ? `Currently ${initialArticle.status}` : "New story"}
      </div>
      {/* Action Buttons */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 [&>button]:w-full">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => handleSubmit("draft")}
            className="border-neutral-300 text-neutral-800 hover:text-black dark:border-neutral-800 dark:text-white text-xs cursor-pointer"
          >
            Save Draft
          </Button>

          {initialArticle?.id && (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => handleSubmit(initialArticle.status === "archived" ? "published" : "archived")}
              className="border-neutral-300 text-neutral-600 hover:text-amber-600 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-amber-300 text-xs cursor-pointer"
            >
              {initialArticle.status === "archived" ? "Unarchive Story" : "Archive Story"}
            </Button>
          )}

          <Button
            type="button"
            disabled={saving}
            onClick={() => handleSubmit("published")}
            className="bg-brand hover:bg-brand-hover text-brand-ink font-bold text-xs cursor-pointer shadow-sm"
          >
            {saving ? "Saving Story..." : initialArticle?.id ? "Update Story" : "Publish Story"}
          </Button>
        </div>
      </div>
      {/* Category & Cover Image */}
      <div className="grid grid-cols-1 gap-5">
        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">Summary</label>
          <textarea
            value={summaryInput}
            onChange={(e) => setSummaryInput(e.target.value.slice(0, 300))}
            rows={3}
            placeholder="Leave empty to use the opening of the story"
            className="w-full rounded-2xl border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as any)}
            className="w-full h-10 rounded-md border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white text-sm px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <option value="news">News</option>
            <option value="politics">Politics</option>
            <option value="business">Business</option>
            <option value="technology">Technology</option>
            <option value="entertainment">Entertainment</option>
            <option value="opinion">Opinion</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              Cover Image
            </label>
            <input
              type="file"
              ref={coverFileInputRef}
              onChange={handleCoverFileUpload}
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => coverFileInputRef.current?.click()}
              disabled={uploadingCover}
              className="text-[11px] font-bold text-brand-text hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {uploadingCover ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Uploading to R2...
                </>
              ) : (
                <>
                  <Upload className="h-3 w-3" /> Upload from Device
                </>
              )}
            </button>
          </div>
          <Input
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            placeholder="Image URL or upload from device..."
            className="text-sm"
          />
        </div>
      </div>

      {/* Cover Image Preview */}
      {coverImageUrl && (
        <div className="relative rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 max-h-48 w-full group">
          <img
            src={coverImageUrl}
            alt="Cover Preview"
            className="w-full h-48 object-cover"
          />
          <button
            type="button"
            onClick={() => setCoverImageUrl("")}
            className="absolute top-2 right-2 rounded-md bg-black/80 px-2 py-1 text-[10px] font-bold text-red-400 hover:text-white transition cursor-pointer"
          >
            Remove Cover
          </button>
        </div>
      )}

    </aside>
    </div>
  );
}
