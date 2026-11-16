export const runtime = "edge";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles } from "@/db/schema";
import { SITE_URL } from "@/lib/seo";

// Public pages worth indexing. Sign-in, saved items, the radio popout and admin are left out
// (and disallowed in public/robots.txt).
const STATIC_PAGES: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "hourly", priority: "1.0" },
  { path: "/articles", changefreq: "hourly", priority: "0.9" },
  { path: "/plus", changefreq: "daily", priority: "0.7" },
  { path: "/plus/videos", changefreq: "daily", priority: "0.6" },
  { path: "/plus/sports", changefreq: "daily", priority: "0.6" },
  { path: "/plus/schedule", changefreq: "daily", priority: "0.6" },
  { path: "/plus/radio", changefreq: "daily", priority: "0.5" },
  { path: "/tips", changefreq: "monthly", priority: "0.4" },
  { path: "/privacy", changefreq: "yearly", priority: "0.1" },
  { path: "/terms", changefreq: "yearly", priority: "0.1" },
];

function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET() {
  const entries: string[] = STATIC_PAGES.map(
    (p) =>
      `<url><loc>${SITE_URL}${p.path === "/" ? "" : p.path}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`
  );

  try {
    const d1 = (process.env as any).DB as D1Database;
    if (d1) {
      const db = getDb(d1);
      const rows = await db
        .select({ slug: articles.slug, publishedAt: articles.publishedAt, updatedAt: articles.updatedAt })
        .from(articles)
        .where(eq(articles.status, "published"))
        .orderBy(desc(articles.publishedAt))
        .limit(5000);
      for (const r of rows) {
        const lastmod = iso(r.updatedAt) ?? iso(r.publishedAt);
        entries.push(
          `<url><loc>${SITE_URL}/articles/${xmlEscape(encodeURIComponent(r.slug))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>weekly</changefreq><priority>0.8</priority></url>`
        );
      }
    }
  } catch (err) {
    console.error("sitemap: could not list articles", err);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=900",
    },
  });
}
