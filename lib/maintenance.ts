// Maintenance mode, used by middleware.ts. Nothing here reads data except the health probe below,
// which reads one row at most once a minute per Cloudflare location.
//
// FORCE_MAINTENANCE: true shows the maintenance page everywhere, whatever the database does.
// Otherwise the page shows by itself while the database refuses requests (e.g. D1's free daily
// read limit) and goes away by itself once it answers again.
export const FORCE_MAINTENANCE = false;
export const MAINTENANCE_MESSAGE = "FTN is undergoing maintenance. We'll be back shortly.";

// The last probe's answer is kept in Cloudflare's cache for a minute, so requests in between
// don't touch the database. A probe only counts as "down" after 3 failed tries in a row, a second
// apart, so one failed request never turns the site off.
const KEY = "https://ftn-db-health.internal/state";
const REMEMBER_S = 60;
const TRIES = 3;
// `select 1` alone reads no rows, and D1 still answers it when the read limit is used up, so the
// probe reads one real row.
const PROBE = "select 1 from sqlite_master limit 1";

export async function databaseDown(): Promise<boolean> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const d1 = (process.env as unknown as { DB?: D1Database }).DB;
  if (!cache || !d1) return false;
  try {
    const hit = await cache.match(KEY);
    if (hit) return (await hit.text()) === "down";
  } catch {
    return false;
  }
  let ok = false;
  for (let i = 0; i < TRIES && !ok; i++) {
    try {
      await d1.prepare(PROBE).first();
      ok = true;
    } catch {
      if (i < TRIES - 1) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const state = ok ? "up" : "down";
  await cache.put(KEY, new Response(state, { headers: { "Cache-Control": `max-age=${REMEMBER_S}` } })).catch(() => {});
  return !ok;
}
