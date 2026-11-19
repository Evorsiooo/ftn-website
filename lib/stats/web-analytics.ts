/*
 * Website visitors from Cloudflare Web Analytics (cookie-free, counted by Cloudflare, so it costs the site no
 * CPU per page view). Read through Cloudflare's GraphQL API with CF_ANALYTICS_TOKEN (Account Analytics: Read)
 * and the account the token belongs to (or CF_ACCOUNT_ID). Answers are cached for 15 minutes.
 */

const HOST = "ftn.euno.cc";
// FTN's Cloudflare account id (not a secret: it is in every dashboard link). A token with only
// "Account Analytics: Read" can't list accounts, so the id can't be looked up from the token.
const FTN_ACCOUNT = "766be096be2baa4677baf5d515e51c8d";
let accountFromToken: string | null = null;

/** The token's account, when no account id is set: the token is limited to FTN's account. */
async function tokenAccount(token: string): Promise<string | null> {
  if (accountFromToken) return accountFromToken;
  const res = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=5", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as any;
  accountFromToken = data?.result?.[0]?.id ?? null;
  return accountFromToken;
}

export interface WebStats {
  days: { day: string; views: number; visits: number }[];
  pages: { path: string; views: number; visits: number }[];
  articles: { path: string; views: number }[];
  referrers: { host: string; visits: number }[];
  countries: { name: string; visits: number }[];
  devices: { name: string; visits: number }[];
}

export type WebResult = { ok: true; stats: WebStats } | { ok: false; reason: "not_configured" | "error"; message?: string };

const QUERY = `query($a: string!, $f: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject, $art: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject) {
  viewer { accounts(filter: { accountTag: $a }) {
    days: rumPageloadEventsAdaptiveGroups(limit: 200, filter: $f, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
    pages: rumPageloadEventsAdaptiveGroups(limit: 15, filter: $f, orderBy: [count_DESC]) { count sum { visits } dimensions { requestPath } }
    articles: rumPageloadEventsAdaptiveGroups(limit: 50, filter: $art, orderBy: [count_DESC]) { count dimensions { requestPath } }
    refs: rumPageloadEventsAdaptiveGroups(limit: 10, filter: $f, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { refererHost } }
    countries: rumPageloadEventsAdaptiveGroups(limit: 10, filter: $f, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { countryName } }
    devices: rumPageloadEventsAdaptiveGroups(limit: 5, filter: $f, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { deviceType } }
  } }
}`;

export async function webStats(days: number): Promise<WebResult> {
  const token = process.env.CF_ANALYTICS_TOKEN;
  if (!token) return { ok: false, reason: "not_configured" };

  const cacheKey = new Request(`https://${HOST}/__stats-cache/web?days=${days}`);
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return { ok: true, stats: (await hit.json()) as WebStats };

  const account = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || FTN_ACCOUNT || (await tokenAccount(token));
  if (!account) return { ok: false, reason: "error", message: "The token can't see any Cloudflare account" };
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const base = [{ datetime_geq: start.toISOString() }, { datetime_leq: end.toISOString() }, { requestHost: HOST }];
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { a: account, f: { AND: base }, art: { AND: [...base, { requestPath_like: "/articles/%" }] } } }),
  }).catch(() => null);
  if (!res) return { ok: false, reason: "error", message: "Cloudflare did not answer" };
  const data = (await res.json().catch(() => null)) as any;
  const acc = data?.data?.viewer?.accounts?.[0];
  if (!res.ok || !acc) return { ok: false, reason: "error", message: data?.errors?.[0]?.message || `HTTP ${res.status}` };

  const stats: WebStats = {
    days: (acc.days ?? []).map((g: any) => ({ day: g.dimensions.date, views: g.count, visits: g.sum?.visits ?? 0 })),
    pages: (acc.pages ?? []).map((g: any) => ({ path: g.dimensions.requestPath, views: g.count, visits: g.sum?.visits ?? 0 })),
    articles: (acc.articles ?? []).map((g: any) => ({ path: g.dimensions.requestPath, views: g.count })),
    referrers: (acc.refs ?? []).map((g: any) => ({ host: g.dimensions.refererHost || "", visits: g.sum?.visits ?? 0 })),
    countries: (acc.countries ?? []).map((g: any) => ({ name: g.dimensions.countryName || "Unknown", visits: g.sum?.visits ?? 0 })),
    devices: (acc.devices ?? []).map((g: any) => ({ name: g.dimensions.deviceType || "Unknown", visits: g.sum?.visits ?? 0 })),
  };
  await cache
    ?.put(cacheKey, new Response(JSON.stringify(stats), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=900" } }))
    .catch(() => {});
  return { ok: true, stats };
}
