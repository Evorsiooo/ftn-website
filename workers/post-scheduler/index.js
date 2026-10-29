// Calls the site's scheduled-posts endpoint on a Cloudflare cron trigger. GitHub's own
// scheduler ran only every ~6 hours, so this is what actually sends scheduled posts on time.
// Deploy: `npx wrangler deploy` here, with the secret set via `npx wrangler secret put SCHEDULE_CRON_SECRET`.
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  async fetch() {
    return new Response("ftn-post-scheduler", { status: 200 });
  },
};

async function run(env) {
  const res = await fetch("https://ftn.euno.cc/api/posts/schedule-cron", {
    method: "POST",
    headers: { "x-cron-secret": env.SCHEDULE_CRON_SECRET },
  });
  if (!res.ok) console.error("schedule-cron failed", res.status, await res.text());
}
