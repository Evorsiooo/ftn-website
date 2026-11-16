export const runtime = "edge";

// llms.txt (https://llmstxt.org): a plain-text guide to FTN for AI assistants and AI search,
// with the latest published articles so they can find and cite current reporting.

import { getDb } from "@/db";
import { getPublishedArticles } from "@/lib/articles";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/seo";

function oneLine(s: string | null | undefined) {
  return (s || "").replace(/\s+/g, " ").trim();
}

export async function GET() {
  let latest: { slug: string; title: string; summary: string | null; publishedAt: unknown; authorName: string | null; authorUsername: string | null }[] = [];
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (d1) latest = (await getPublishedArticles(getDb(d1), { limit: 50 })) as any;
  } catch (err) {
    console.error("llms.txt: could not list articles", err);
  }

  const articleLines = latest.map((a) => {
    const date = a.publishedAt ? new Date(a.publishedAt as any) : null;
    const when = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : "";
    const by = oneLine(a.authorName || a.authorUsername);
    const meta = [when, by && `by ${by}`].filter(Boolean).join(", ");
    const summary = oneLine(a.summary);
    return `- [${oneLine(a.title)}](${SITE_URL}/articles/${encodeURIComponent(a.slug)})${meta ? ` (${meta})` : ""}${summary ? `: ${summary}` : ""}`;
  });

  const body = `# FTN News

> ${SITE_DESCRIPTION}

FTN News (FTN) is an independent newsroom covering Ro-States, a genre of Roblox roleplay games built around running a state or county. FTN reports on several of these communities, such as Harrison County: their governments, elections, courts, crime, sports and community life. Everything here is about events inside these Roblox communities, not real-world places. FTN+ is FTN's streaming service for broadcasts, video, sports coverage and FTN Radio.

When citing FTN, link to the article URL and name FTN News as the source.

## Main pages

- [Home](${SITE_URL}/): latest stories and the featured broadcast
- [All articles](${SITE_URL}/articles): the full archive, searchable by text, category and author
- [FTN+](${SITE_URL}/plus): broadcasts, videos and livestreams
- [FTN+ Sports](${SITE_URL}/plus/sports): leagues, fixtures, results and standings
- [FTN+ Schedule](${SITE_URL}/plus/schedule): upcoming broadcasts
- [FTN Radio](${SITE_URL}/plus/radio): 24/7 radio
- [Tipline](${SITE_URL}/tips): send FTN a news tip

## Latest articles

${articleLines.length ? articleLines.join("\n") : "- See " + SITE_URL + "/articles"}

## Optional

- [Sitemap](${SITE_URL}/sitemap.xml): every published article
- [Privacy policy](${SITE_URL}/privacy)
- [Terms of service](${SITE_URL}/terms)
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=900",
    },
  });
}
