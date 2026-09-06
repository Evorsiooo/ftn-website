import { eq, and, desc, like, or, sql } from "drizzle-orm";
import { DbClient } from "@/db";
import { articles, articleRevisions, comments, users } from "@/db/schema";
import { slugify } from "./utils";

export interface ArticleInput {
  id?: string;
  title: string;
  summary?: string;
  content: string;
  category: "news" | "politics" | "business" | "technology" | "entertainment" | "opinion";
  coverImageUrl?: string;
  opinionRole?: string;
  opinionQuote?: string;
  status: "draft" | "published" | "archived";
  authorId: string;
}

export async function getPublishedArticles(
  db: DbClient,
  options: {
    category?: string;
    author?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const { category, author, search, limit = 50, offset = 0 } = options;
  const conditions = [eq(articles.status, "published")];

  if (category && category !== "all") {
    conditions.push(eq(articles.category, category as any));
  }

  if (author) {
    conditions.push(sql`lower(${users.robloxUsername}) = ${author.toLowerCase()}`);
  }

  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(
      or(
        like(articles.title, searchPattern),
        like(articles.summary, searchPattern),
        like(articles.content, searchPattern)
      )!
    );
  }

  return db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      summary: articles.summary,
      content: articles.content,
      coverImageUrl: articles.coverImageUrl,
      category: articles.category,
      opinionRole: articles.opinionRole,
      opinionQuote: articles.opinionQuote,
      status: articles.status,
      publishedAt: articles.publishedAt,
      createdAt: articles.createdAt,
      authorName: users.displayName,
      authorUsername: users.robloxUsername,
      authorAvatar: users.avatarUrl,
    })
    .from(articles)
    .leftJoin(users, eq(articles.authorId, users.id))
    .where(and(...conditions))
    .orderBy(desc(articles.publishedAt), desc(articles.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getAllAdminArticles(db: DbClient) {
  return db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      summary: articles.summary,
      content: articles.content,
      coverImageUrl: articles.coverImageUrl,
      category: articles.category,
      opinionRole: articles.opinionRole,
      opinionQuote: articles.opinionQuote,
      status: articles.status,
      publishedAt: articles.publishedAt,
      createdAt: articles.createdAt,
      updatedAt: articles.updatedAt,
      authorName: users.displayName,
      authorUsername: users.robloxUsername,
      authorAvatar: users.avatarUrl,
    })
    .from(articles)
    .leftJoin(users, eq(articles.authorId, users.id))
    .orderBy(desc(articles.updatedAt), desc(articles.createdAt));
}

export async function getArticleBySlug(db: DbClient, slug: string) {
  const results = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      summary: articles.summary,
      content: articles.content,
      coverImageUrl: articles.coverImageUrl,
      category: articles.category,
      opinionRole: articles.opinionRole,
      opinionQuote: articles.opinionQuote,
      status: articles.status,
      publishedAt: articles.publishedAt,
      createdAt: articles.createdAt,
      updatedAt: articles.updatedAt,
      authorId: articles.authorId,
      authorName: users.displayName,
      authorUsername: users.robloxUsername,
      authorAvatar: users.avatarUrl,
    })
    .from(articles)
    .leftJoin(users, eq(articles.authorId, users.id))
    .where(eq(articles.slug, slug))
    .limit(1);

  return results[0] || null;
}

export async function getArticleById(db: DbClient, id: string) {
  const results = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      summary: articles.summary,
      content: articles.content,
      coverImageUrl: articles.coverImageUrl,
      category: articles.category,
      opinionRole: articles.opinionRole,
      opinionQuote: articles.opinionQuote,
      status: articles.status,
      publishedAt: articles.publishedAt,
      createdAt: articles.createdAt,
      updatedAt: articles.updatedAt,
      authorId: articles.authorId,
      authorName: users.displayName,
      authorUsername: users.robloxUsername,
      authorAvatar: users.avatarUrl,
    })
    .from(articles)
    .leftJoin(users, eq(articles.authorId, users.id))
    .where(eq(articles.id, id))
    .limit(1);

  return results[0] || null;
}

export async function createArticle(db: DbClient, input: ArticleInput) {
  const id = input.id || crypto.randomUUID();
  const baseSlug = slugify(input.title);
  const slug = `${baseSlug}-${id.slice(0, 8)}`;

  // Derive summary if not provided
  const plainText = input.content.replace(/<[^>]*>/g, "");
  const summary =
    input.summary || plainText.slice(0, 220).trim() + (plainText.length > 220 ? "..." : "");

  const newArticle = {
    id,
    slug,
    title: input.title,
    summary,
    content: input.content,
    coverImageUrl: input.coverImageUrl || null,
    category: input.category,
    status: input.status,
    opinionRole: input.opinionRole || null,
    opinionQuote: input.opinionQuote || null,
    authorId: input.authorId,
    publishedAt: input.status === "published" ? new Date() : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(articles).values(newArticle);

  // Snapshot initial revision (v1)
  try {
    await db.insert(articleRevisions).values({
      id: crypto.randomUUID(),
      articleId: id,
      versionNumber: 1,
      title: newArticle.title,
      summary: newArticle.summary,
      content: newArticle.content,
      coverImageUrl: newArticle.coverImageUrl,
      category: newArticle.category,
      status: newArticle.status,
      opinionRole: newArticle.opinionRole,
      opinionQuote: newArticle.opinionQuote,
      editedBy: newArticle.authorId,
      createdAt: new Date(),
    });
  } catch (err) {
    console.warn("Initial revision snapshot error:", err);
  }

  return newArticle;
}

export async function updateArticle(
  db: DbClient,
  id: string,
  input: Partial<ArticleInput>,
  editedBy?: string,
  revertedFromVersion?: number
) {
  const plainText = input.content ? input.content.replace(/<[^>]*>/g, "") : "";
  const summary =
    input.summary || (plainText ? plainText.slice(0, 220).trim() + (plainText.length > 220 ? "..." : "") : undefined);

  const updateData: any = {
    ...input,
    updatedAt: new Date(),
  };

  if (summary) updateData.summary = summary;
  if (input.status === "published") {
    const existing = await getArticleById(db, id);
    if (!existing?.publishedAt) {
      updateData.publishedAt = new Date();
    }
  }

  await db.update(articles).set(updateData).where(eq(articles.id, id));

  // Retrieve full updated article for snapshotting
  try {
    const updatedRow = await getArticleById(db, id);
    if (updatedRow) {
      // Find latest revision number
      const existingRevs = await db
        .select({ versionNumber: articleRevisions.versionNumber })
        .from(articleRevisions)
        .where(eq(articleRevisions.articleId, id))
        .orderBy(desc(articleRevisions.versionNumber))
        .limit(1);

      const nextVersion = (existingRevs[0]?.versionNumber || 0) + 1;

      await db.insert(articleRevisions).values({
        id: crypto.randomUUID(),
        articleId: id,
        versionNumber: nextVersion,
        revertedFromVersion: revertedFromVersion || null,
        title: updatedRow.title,
        summary: updatedRow.summary,
        content: updatedRow.content,
        coverImageUrl: updatedRow.coverImageUrl,
        category: updatedRow.category as any,
        status: updatedRow.status as any,
        opinionRole: updatedRow.opinionRole,
        opinionQuote: updatedRow.opinionQuote,
        editedBy: editedBy || updatedRow.authorId,
        createdAt: new Date(),
      });
    }
  } catch (err) {
    console.warn("Update revision snapshot error:", err);
  }

  return { id, ...updateData };
}

export async function getArticleRevisions(db: DbClient, articleId: string) {
  return db
    .select({
      id: articleRevisions.id,
      articleId: articleRevisions.articleId,
      versionNumber: articleRevisions.versionNumber,
      revertedFromVersion: articleRevisions.revertedFromVersion,
      title: articleRevisions.title,
      summary: articleRevisions.summary,
      content: articleRevisions.content,
      coverImageUrl: articleRevisions.coverImageUrl,
      category: articleRevisions.category,
      opinionRole: articleRevisions.opinionRole,
      opinionQuote: articleRevisions.opinionQuote,
      status: articleRevisions.status,
      createdAt: articleRevisions.createdAt,
      editorName: users.displayName,
      editorUsername: users.robloxUsername,
      editorAvatar: users.avatarUrl,
    })
    .from(articleRevisions)
    .leftJoin(users, eq(articleRevisions.editedBy, users.id))
    .where(eq(articleRevisions.articleId, articleId))
    .orderBy(desc(articleRevisions.versionNumber));
}

export async function revertArticleToRevision(
  db: DbClient,
  articleId: string,
  revisionId: string,
  revertedBy: string
) {
  const revs = await db
    .select()
    .from(articleRevisions)
    .where(and(eq(articleRevisions.id, revisionId), eq(articleRevisions.articleId, articleId)))
    .limit(1);

  if (revs.length === 0) {
    throw new Error("Revision not found");
  }

  const target = revs[0];

  return updateArticle(
    db,
    articleId,
    {
      title: target.title,
      summary: target.summary,
      content: target.content,
      coverImageUrl: target.coverImageUrl || undefined,
      category: target.category as any,
      status: target.status as any,
      opinionRole: target.opinionRole || undefined,
      opinionQuote: target.opinionQuote || undefined,
    },
    revertedBy,
    target.versionNumber
  );
}

export async function getArticleComments(db: DbClient, articleId: string) {
  return db
    .select({
      id: comments.id,
      content: comments.content,
      createdAt: comments.createdAt,
      userId: comments.userId,
      userName: users.displayName,
      userUsername: users.robloxUsername,
      userAvatar: users.avatarUrl,
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(and(eq(comments.articleId, articleId), eq(comments.status, "visible")))
    .orderBy(desc(comments.createdAt));
}

export async function addComment(
  db: DbClient,
  articleId: string,
  userId: string,
  content: string
) {
  const id = crypto.randomUUID();
  const newComment = {
    id,
    articleId,
    userId,
    content,
    status: "visible" as const,
    createdAt: new Date(),
  };

  await db.insert(comments).values(newComment);
  return newComment;
}

export async function deleteComment(db: DbClient, commentId: string) {
  await db.delete(comments).where(eq(comments.id, commentId));
  return { success: true };
}
