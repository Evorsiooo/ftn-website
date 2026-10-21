# Deployment

The site is a Next.js app on Cloudflare Pages, built with `@cloudflare/next-on-pages`.

## Git auto-deploy (Cloudflare Pages)

Build settings in the Cloudflare dashboard:

- Framework preset: None
- Build command: `npx @cloudflare/next-on-pages`
- Build output directory: `.vercel/output/static`
- Root directory: `/`
- Production branch: `main`
- Environment variable `NODE_VERSION` = `20` or newer

D1 (`DB`), KV (`CACHE`) and R2 (`ftn_media`) bindings and the `nodejs_compat` flag come from `wrangler.toml`.
Secrets live in the Cloudflare dashboard (Settings, Variables and Secrets), never in git:
`JWT_SECRET`, `ROBLOX_CLIENT_ID`, `ROBLOX_CLIENT_SECRET`, `ROBLOX_REDIRECT_URI`, `YOUTUBE_API_KEY`, `CRON_SECRET`
and, for the Posts feature, `DISCORD_BOT_TOKEN`.

Pushes to other branches produce preview deployments on a `pages.dev` address.

## Database migrations are manual

Deploying does not run D1 migrations. After merging a change that adds a file to `drizzle/migrations`, run:

```bash
npx wrangler d1 migrations apply ftn-db --remote
```

Run it **before** the new code goes live if the code reads the new columns or tables, or immediately after the merge,
because a deploy that queries missing columns will error. To test locally: `npm run db:migrate:local`.

To create a migration after editing `db/schema.ts`: `npm run db:generate`, then review the SQL before committing.
