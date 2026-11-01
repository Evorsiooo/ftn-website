// Runs every minute on a Cloudflare cron trigger and calls the site's secret-protected endpoints:
// sends scheduled posts whose time has come, refreshes Twitch live status, and (every 5 minutes)
// syncs YouTube. GitHub's own scheduler ran only every ~6 hours, so this is what keeps these on time.
// Deploy: `npx wrangler deploy` here, with the secret set via `npx wrangler secret put SCHEDULE_CRON_SECRET`.
const SITE = "https://ftn.euno.cc";

export default {
  async scheduled(event, env, ctx) {
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    ctx.waitUntil(call(env, "/api/posts/schedule-cron"));
    ctx.waitUntil(call(env, `/api/sync/live-cron${minute % 5 === 0 ? "?youtube=1" : ""}`));
  },
  async fetch() {
    return new Response("ftn-post-scheduler", { status: 200 });
  },
};

async function call(env, path) {
  const res = await fetch(SITE + path, { method: "POST", headers: { "x-cron-secret": env.SCHEDULE_CRON_SECRET } });
  if (!res.ok) console.error(path, "failed", res.status, await res.text());
}
