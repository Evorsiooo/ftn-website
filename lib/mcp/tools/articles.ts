import * as articlesRoute from "@/app/api/articles/route";
import * as articleRoute from "@/app/api/articles/[slug]/route";
import * as revisionsRoute from "@/app/api/articles/[slug]/revisions/route";
import * as commentsRoute from "@/app/api/articles/[slug]/comments/route";
import { S, ToolDef, pick } from "../types";

const CATEGORIES = ["news", "politics", "business", "technology", "entertainment", "opinion"] as const;
const STATUSES = ["draft", "published", "archived"] as const;

const articleFields = {
  content: S.str("The article body as HTML (<p>, <h2>, <ul>, <blockquote>, <a>, <img>...). Unsafe HTML is removed."),
  category: S.enum(CATEGORIES, "Section of the site"),
  status: S.enum(STATUSES, "draft (only staff see it), published (live on the site), archived"),
  coverImageUrl: S.str("Cover image URL. Use upload_image first for an image from elsewhere."),
  summary: S.str("Short summary shown on cards. Made from the first lines when left out."),
  opinionRole: S.str("Opinion pieces: the writer's role line"),
  opinionQuote: S.str("Opinion pieces: the pull quote"),
};

export const articleTools: ToolDef[] = [
  {
    name: "list_articles",
    title: "List articles",
    description: "Every article (drafts, published and archived), newest first, with slug, title, status, category and author.",
    input: { search: S.str("Only articles whose title contains this") },
    kind: "read",
    run: async (ctx, a) => {
      const data = await ctx.call(articlesRoute.GET, { path: "/api/articles", query: { admin: "true" } });
      let list = (data.articles || data) as Array<Record<string, unknown>>;
      if (a.search) list = list.filter((x) => String(x.title || "").toLowerCase().includes(String(a.search).toLowerCase()));
      return list.map((x) => pick(x, ["id", "slug", "title", "status", "category", "authorName", "publishedAt", "updatedAt"]));
    },
  },
  {
    name: "get_article",
    title: "Read an article",
    description: "One article with its full HTML content.",
    input: { slug: S.str("The article's slug (from list_articles)") },
    required: ["slug"],
    kind: "read",
    run: (ctx, a) => ctx.call(articleRoute.GET, { path: `/api/articles/${a.slug}`, params: { slug: a.slug } }),
  },
  {
    name: "create_article",
    title: "Write a new article",
    description:
      "Creates an article. It shows the signed-in person as its author. status draft keeps it hidden; published puts it live on the site at once.",
    input: { title: S.str("Headline, up to 300 characters"), ...articleFields },
    required: ["title", "content", "category", "status"],
    kind: "write",
    summary: (a) => `Write article "${a.title}" (${a.status})`,
    run: (ctx, a) =>
      ctx.call(articlesRoute.POST, {
        method: "POST",
        path: "/api/articles",
        body: pick(a, ["title", "content", "category", "status", "coverImageUrl", "summary", "opinionRole", "opinionQuote"]),
      }),
  },
  {
    name: "update_article",
    title: "Edit an article",
    description: "Changes an article. Send the full title and content again (get_article first); other fields only when changing them. Setting status published puts it live.",
    input: { id: S.str("The article's id (from list_articles or get_article)"), title: S.str("Headline"), ...articleFields },
    required: ["id", "title", "content"],
    kind: "write",
    summary: (a) => `Edit article "${a.title}"${a.status ? ` (${a.status})` : ""}`,
    run: (ctx, a) =>
      ctx.call(articlesRoute.POST, {
        method: "POST",
        path: "/api/articles",
        body: pick(a, ["id", "title", "content", "category", "status", "coverImageUrl", "summary", "opinionRole", "opinionQuote"]),
      }),
  },
  {
    name: "list_article_revisions",
    title: "Article history",
    description: "Earlier saved versions of an article.",
    input: { slug: S.str("The article's slug") },
    required: ["slug"],
    kind: "read",
    run: (ctx, a) => ctx.call(revisionsRoute.GET, { path: `/api/articles/${a.slug}/revisions`, params: { slug: a.slug } }),
  },
  {
    name: "restore_article_revision",
    title: "Restore an earlier version",
    description: "Puts an earlier version of an article back (the current one is kept in the history).",
    input: { slug: S.str("The article's slug"), revisionId: S.str("From list_article_revisions") },
    required: ["slug", "revisionId"],
    kind: "write",
    refs: { slug: "article" },
    summary: (a) => `Restore an earlier version of article ${a.slug}`,
    run: (ctx, a) =>
      ctx.call(revisionsRoute.POST, { method: "POST", path: `/api/articles/${a.slug}/revisions`, params: { slug: a.slug }, body: { revisionId: a.revisionId } }),
  },
  {
    name: "delete_article",
    title: "Delete an article",
    description: "Deletes an article for good.",
    input: { slug: S.str("The article's slug") },
    required: ["slug"],
    kind: "danger",
    refs: { slug: "article" },
    summary: (a) => `Delete article ${a.slug}`,
    run: (ctx, a) => ctx.call(articleRoute.DELETE, { method: "DELETE", path: `/api/articles/${a.slug}`, params: { slug: a.slug } }),
  },
  {
    name: "list_article_comments",
    title: "Reader comments",
    description: "Comments readers left on an article.",
    input: { slug: S.str("The article's slug") },
    required: ["slug"],
    kind: "read",
    run: (ctx, a) => ctx.call(commentsRoute.GET, { path: `/api/articles/${a.slug}/comments`, params: { slug: a.slug } }),
  },
  {
    name: "delete_article_comment",
    title: "Delete a reader comment",
    description: "Removes a reader's comment.",
    input: { slug: S.str("The article's slug"), commentId: S.str("From list_article_comments") },
    required: ["slug", "commentId"],
    kind: "danger",
    refs: { slug: "article" },
    summary: (a) => `Delete a comment on article ${a.slug}`,
    run: (ctx, a) =>
      ctx.call(commentsRoute.DELETE, { method: "DELETE", path: `/api/articles/${a.slug}/comments`, params: { slug: a.slug }, query: { commentId: a.commentId } }),
  },
];
