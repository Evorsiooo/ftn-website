# Quickstart & Verification Guide: FTN Media Group Platform

This guide outlines prerequisites, foundational setup commands, and end-to-end verification scenarios to validate the implementation on Cloudflare Pages.

---

## 1. Prerequisites & Environment Setup

- Node.js 20+ & npm / pnpm
- Cloudflare Wrangler CLI (`npm install -g wrangler` or `npx wrangler`)
- Environment variables configured in `.env.local` / Cloudflare Secrets:
  - `ROBLOX_CLIENT_ID` / `ROBLOX_CLIENT_SECRET` (Roblox OAuth2 credentials)
  - `SESSION_SECRET` (JWT encryption key)
  - `YOUTUBE_API_KEY` (YouTube Data API v3 key)
  - `YOUTUBE_CHANNEL_IDS` (Comma-separated channel IDs)
  - `ICECAST_STREAM_URL` (Live audio stream URL)
  - `ICECAST_METADATA_URL` (Stream status/metadata URL)

---

## 2. Foundational Setup Sequence

### Step 2.1: Project Initialization & Dependencies
```bash
# Initialize Next.js with TypeScript and Tailwind CSS
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm

# Install core animation, UI, and edge database packages
npm install framer-motion clsx tailwind-merge lucide-react @tabler/icons-react drizzle-orm
npm install -D drizzle-kit @cloudflare/next-on-pages wrangler
```

### Step 2.2: shadcn Initialization & Aceternity Registry Configuration
```bash
# Initialize shadcn UI
npx shadcn@latest init
```

Verify `components.json` contains the configured `@aceternity` registry:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "registries": {
    "@aceternity": "https://ui.aceternity.com/registry/{name}.json"
  }
}
```

### Step 2.3: Cloudflare D1 Local Database Setup
```bash
# Generate Drizzle migration schema
npx drizzle-kit generate

# Run migration against local D1 SQLite database
npx wrangler d1 execute ftn-db --local --file=./drizzle/migrations/0000_init.sql
```

---

## 3. End-to-End Validation Scenarios

### Scenario 1: Foundation & Constitutional Assembly Check
1. Start development server: `npm run dev`
2. Load `http://localhost:3000`
3. **Verify**:
   - Navbar displays cleanly with primary items (Home, Articles, FTN Sports, FTN Radio, FTN+, Auth Status).
   - Audio Player Dock is present at the bottom of the viewport with Icecast playback controls.
   - Zero emojis in navigation, headers, or buttons.
   - Zero meta-labels in parentheses or generic filler copy.

### Scenario 2: Roblox Authentication & Root Admin Seed
1. Navigate to `/api/auth/session` (initially returns `{ "authenticated": false }`).
2. Log in with Roblox account `alphaze1`.
3. Re-check `/api/auth/session`.
4. **Verify**: Returns `{ "authenticated": true, "user": { "roblox_username": "alphaze1", "roles": ["site_admin"] } }`.
5. Access `/admin/roles` to verify that role delegation UI is accessible.

### Scenario 3: News Article Authoring & Reader Interaction
1. As a user with `digital_publishing_division` or `site_admin`, open `/admin/articles`.
2. Draft an article with rich text formatting, set category to `Ro-State Affairs`, and publish.
3. As a public visitor, navigate to `/articles` and open the article slug.
4. Post a comment while signed in; verify immediate appearance.

### Scenario 4: FTN+ OTT Video Sync & Watchlist
1. Trigger sync via `POST /api/sync/youtube`.
2. Navigate to `/plus`.
3. **Verify**: Full-page dark mode renders aggregated video carousels and active livestreams.
4. Click "Save to Watchlist"; verify video persists in `/plus/watchlist`.

### Scenario 5: Sports League Management & Dynamic Standings
1. In `/admin/sports`, create a new league (e.g., Hockey) with Win=2, OTL=1, Loss=0 scoring rules.
2. Add teams and create a fixture.
3. Submit score: Home 3, Away 1.
4. Navigate to `/sports`.
5. **Verify**: Standings table immediately updates points, games played, and goal differential.

### Scenario 6: Anonymous Tipline Submission
1. Open `/tips`.
2. Submit a confidential tip text without signing in.
3. Open `/admin/tips` as staff; verify tip is received and no IP/user session is associated.
