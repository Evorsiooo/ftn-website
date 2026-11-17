// Runs every minute on a Cloudflare cron trigger and calls the site's secret-protected endpoints:
// sends scheduled posts whose time has come, refreshes Twitch live status, (every 5 minutes) syncs
// YouTube and starts the link preview workflow when cards are missing, and (hourly) rotates the
// radio password when due. GitHub's own scheduler runs only a few times a day on this repository,
// so this is what keeps these on time.
//
// Deploy: `npx wrangler deploy` here. Secrets (Cloudflare dashboard > Workers > ftn-post-scheduler >
// Settings > Variables and Secrets, or `npx wrangler secret put <NAME>`):
//   SCHEDULE_CRON_SECRET  the site's cron secret
//   GITHUB_TOKEN          fine-grained token for Evorsiooo/ftn-website with "Actions: Read and write";
//                         without it the link preview cards are only drawn when GitHub's scheduler runs
const SITE = "https://ftn.euno.cc";
const REPO = "Evorsiooo/ftn-website";
const CARD_WORKFLOW = "og-cards.yml";

export default {
  async scheduled(event, env, ctx) {
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    ctx.waitUntil(call(env, "/api/posts/schedule-cron"));
    ctx.waitUntil(call(env, `/api/sync/live-cron${minute % 5 === 0 ? "?youtube=1" : ""}`));
    if (minute % 5 === 2) ctx.waitUntil(drawMissingCards(env));
    if (minute === 5) ctx.waitUntil(call(env, "/api/radio/rotate-cron"));
  },
  async fetch() {
    return new Response("ftn-post-scheduler", { status: 200 });
  },
};

async function call(env, path) {
  const res = await fetch(SITE + path, { method: "POST", headers: { "x-cron-secret": env.SCHEDULE_CRON_SECRET } });
  if (!res.ok) console.error(path, "failed", res.status, await res.text());
}

// Link preview cards are drawn in Chromium by a GitHub workflow (the site can't draw images). Start it
// when the site says cards are missing and no run is already queued or running.
async function drawMissingCards(env) {
  if (!env.GITHUB_TOKEN) return;
  const pending = await fetch(`${SITE}/api/og/pending?limit=1`, { headers: { "x-cron-secret": env.SCHEDULE_CRON_SECRET } });
  if (!pending.ok) return console.error("og pending failed", pending.status);
  const { missing } = await pending.json();
  if (!missing) return;

  const gh = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "ftn-post-scheduler",
  };
  const base = `https://api.github.com/repos/${REPO}/actions/workflows/${CARD_WORKFLOW}`;
  for (const status of ["queued", "in_progress"]) {
    const runs = await fetch(`${base}/runs?status=${status}&per_page=1`, { headers: gh });
    if (runs.ok && (await runs.json()).total_count > 0) return;
  }
  const res = await fetch(`${base}/dispatches`, { method: "POST", headers: gh, body: JSON.stringify({ ref: "main" }) });
  if (!res.ok) console.error("og workflow dispatch failed", res.status, await res.text());
}
