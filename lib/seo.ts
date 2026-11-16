// Shared values for search engines and AI assistants: canonical URLs, sitemap, llms.txt and
// schema.org structured data (JSON-LD).

export const SITE_URL = "https://ftn.euno.cc";
export const SITE_NAME = "FTN News";
export const SITE_DESCRIPTION =
  "The #1 Roblox Ro-State news source, covering politics, sports, crime, and more.";
export const SITE_LOGO = `${SITE_URL}/logos/ftn_favicon_transparent.png`;

/** Turns a site path (or an already absolute URL) into an absolute URL on the public domain. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export const publisherJsonLd = {
  "@type": "NewsMediaOrganization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  alternateName: "FTN",
  url: SITE_URL,
  logo: { "@type": "ImageObject", url: SITE_LOGO },
  description: SITE_DESCRIPTION,
};

/** schema.org data for the home page: FTN as a news organisation, and the site itself. */
export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      publisherJsonLd,
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/articles?search={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

export interface ArticleForJsonLd {
  slug: string;
  title: string;
  summary?: string | null;
  coverImageUrl?: string | null;
  category?: string | null;
  publishedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  authorName?: string | null;
  authorUsername?: string | null;
  opinionRole?: string | null;
}

/** schema.org NewsArticle (or OpinionNewsArticle) for one article page. */
export function articleJsonLd(a: ArticleForJsonLd) {
  const url = `${SITE_URL}/articles/${a.slug}`;
  const published = toIso(a.publishedAt) ?? toIso(a.createdAt);
  const modified = toIso(a.updatedAt) ?? published;
  const authorName = a.authorName || a.authorUsername;
  const image = a.coverImageUrl?.trim() ? absoluteUrl(a.coverImageUrl.trim()) : undefined;
  return {
    "@context": "https://schema.org",
    "@type": a.category === "opinion" ? "OpinionNewsArticle" : "NewsArticle",
    "@id": `${url}#article`,
    mainEntityOfPage: url,
    url,
    headline: a.title.slice(0, 110),
    ...(a.summary ? { description: a.summary } : {}),
    ...(image ? { image: [image] } : {}),
    ...(published ? { datePublished: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    ...(a.category ? { articleSection: a.category } : {}),
    inLanguage: "en",
    ...(authorName
      ? {
          author: [
            {
              "@type": "Person",
              name: authorName,
              ...(a.authorUsername
                ? { url: `${SITE_URL}/articles?author=${encodeURIComponent(a.authorUsername)}` }
                : {}),
            },
          ],
        }
      : {}),
    publisher: publisherJsonLd,
    isAccessibleForFree: true,
  };
}

/** Serialises JSON-LD for a <script> tag, escaping "<" so article text can't close the tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
