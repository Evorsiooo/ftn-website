# Implementation Plan: FTN Media Group Platform

**Branch**: `001-ftn-media-platform` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-ftn-media-platform/spec.md` and user tech preferences (Cloudflare Pages free tier, Next.js, shadcn + Aceternity UI registry).

---

## Summary

Build and deploy the **FTN Media Group Platform** on **Cloudflare Pages** using **Next.js (App Router)**, **Cloudflare D1** (Serverless SQLite with Drizzle ORM), **Cloudflare KV**, **Tailwind CSS**, and **Aceternity UI** components discovered and installed via `shadcn` CLI / MCP server (`@aceternity` custom registry).

The implementation enforces a foundational setup first (project bootstrapping, `components.json` with `@aceternity` registry, global navigation/audio shell) before building out feature-level modules (Articles & Rich Text Publishing, Roblox OAuth & RBAC, FTN+ OTT Streaming Wrapper, FTN Sports & Standings Engine, FTN Web Radio, Ad Banners, and Anonymous Tipline).

---

## Technical Context

- **Language/Version**: TypeScript 5.x / Node.js 20+
- **Primary Framework**: Next.js 14+ (App Router) deployed to **Cloudflare Pages** (via `@cloudflare/next-on-pages` or OpenNext Cloudflare adapter)
- **UI & Component System**: Tailwind CSS, `shadcn` CLI with `@aceternity` registry (`https://ui.aceternity.com/registry/{name}.json`), `framer-motion`, `lucide-react`, `@tabler/icons-react`
- **Database & Storage**: **Cloudflare D1** (Serverless SQLite) with **Drizzle ORM**; **Cloudflare KV** for YouTube and Icecast polling cache
- **Authentication**: Roblox OAuth2 flow with secure HTTP-only session JWT cookies; RBAC with default superuser `alphaze1`
- **Media & Streaming Integrations**:
  - *FTN+*: YouTube Data API v3 auto-ingestion + responsive YouTube iframe player embed
  - *FTN Radio*: Icecast live audio stream with persistent dock player and detached popout player
- **Testing**: Vitest for unit/contract tests, Playwright for end-to-end integration tests
- **Target Platform**: Cloudflare Pages Edge Runtime (Global CDN)
- **Performance Goals**: Initial page load < 2s; Standings computation < 5s; Audio playback init < 1.5s
- **Constraints**: Free-tier Cloudflare service limits (5M D1 reads/day, 100k D1 writes/day, 5GB storage, 100k KV reads/day); Zero custom CSS tinkering on Aceternity components; Zero emojis in nav/headings/buttons; Anti-filler copy rules

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked post-design.*

- [x] **Component Assembly Law**: All UI components will be sourced via `shadcn` MCP / CLI from `@shadcn` and `@aceternity` registries. No custom hand-crafted UI from scratch; assembled strictly as pre-built Lego blocks with zero manual style or animation modifications.
- [x] **Copywriting & Content Rules**: All page headers, navigation links, and administrative consoles strictly omit meta-explanations, parenthetical tags, generic filler phrases, and emojis.
- [x] **Registry Configuration**: `components.json` is configured upfront with `"@aceternity": "https://ui.aceternity.com/registry/{name}.json"`.
- [x] **Governance & Compliance**: All routes, data models, and API endpoints are mapped directly to spec requirements.

*Result*: **PASS** (Zero violations).

---

## UI Architecture & Aceternity Component Mappings

In strict compliance with the Project Constitution (Component Assembly Law), the following pre-built Lego blocks from the `@aceternity` registry will be assembled as-is without manual style or internal animation overrides:

### 1. FTN+ (OTT Streaming Platform)
- **`@aceternity/spotlight`**: Ambient illumination for the featured live stream / premiere broadcast hero banner.
- **`@aceternity/focus-cards`**: Netflix/iPlayer style horizontal media rows with active hover expansion.
- **`@aceternity/card-hover-effect`**: Grid catalog for YouTube playlists, category archives, podcasts, and saved watchlists.
- **`@aceternity/moving-border`**: Animated border wrapper for the "Live Now" broadcast status indicator and player actions.
- **`@aceternity/background-gradient`**: Ambient glow container framing the embedded YouTube theater player.

### 2. FTN News & Editorial Publishing
- **`@aceternity/bento-grid`**: Modular editorial layout for breaking news headlines, lead stories, and opinion clusters.
- **`@aceternity/direction-aware-hover`**: Directional image hover overlay for article preview cards (revealing author, timestamp, and summary).
- **`@aceternity/tracing-beam`**: Vertical reading progress beam for long-form investigative journalism and articles.
- **`@aceternity/infinite-moving-cards`**: Continuous breaking news ticker bar across the publication feed.
- **`@aceternity/text-generate-effect`**: Headline typography reveal on article pages.

### 3. FTN Sports Hub & Standings
- **`@aceternity/tabs`**: Seamless animated tab switcher between Leagues, Standings, and Fixture Calendars.
- **`@aceternity/timeline`**: Chronological event schedule timeline for upcoming fixtures, live matches, and past race results.
- **`@aceternity/wobble-card`**: Perspective-reactive feature cards highlighting the "Match of the Week" or "Championship Race".
- **`@aceternity/card-spotlight`**: Standings table container and leaderboards with cursor-following radial highlights.

### 4. FTN Radio
- **`@aceternity/aurora-background`**: Ambient, fluid studio backdrop for the dedicated `/radio` broadcast hub.
- **`@aceternity/hover-border-gradient`**: Container for the persistent bottom audio player dock and playback controls.
- **`@aceternity/timeline`**: Timetable grid for the weekly radio show schedule and presenter lineups.
- **`@aceternity/background-gradient-animation`**: Dynamic visualizer backdrop for the detached popout audio player.

### 5. Global Shell & Navigation
- **`@aceternity/navbar-menu`**: Floating top navigation bar with standard links and distinct emphasis for the FTN+ portal button.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-ftn-media-platform/
├── spec.md              # Feature specification
├── plan.md              # This file (Implementation Plan)
├── research.md          # Phase 0 research findings & tech decisions
├── data-model.md        # Phase 1 relational schema & entity definitions
├── quickstart.md        # Phase 1 verification & validation guide
├── contracts/           # Phase 1 API and UI interface contracts
│   ├── auth-contracts.md
│   ├── content-contracts.md
│   ├── plus-contracts.md
│   ├── sports-contracts.md
│   ├── radio-contracts.md
│   └── ads-tips-contracts.md
└── checklists/
    └── requirements.md  # Quality validation checklist
```

### Source Code (repository root)

```text
├── .specify/                         # Spec Kit metadata, scripts, constitution
├── app/                              # Next.js App Router (Cloudflare Pages edge routes)
│   ├── (public)/                     # Public layout & pages
│   │   ├── page.tsx                  # Homepage (Hero, Breaking News, Featured Stream)
│   │   ├── articles/
│   │   │   ├── page.tsx              # News feed by category & search
│   │   │   └── [slug]/page.tsx       # Full article view & Roblox comment section
│   │   ├── sports/
│   │   │   ├── page.tsx              # Sports Hub (Leagues, Standings, Calendar)
│   │   │   └── [leagueId]/page.tsx   # League/series dedicated standings & fixtures
│   │   ├── radio/
│   │   │   ├── page.tsx              # Dedicated Web Radio Hub & Show Schedule
│   │   │   └── popout/page.tsx       # Detached popout audio player
│   │   ├── games/
│   │   │   └── page.tsx              # Extensible Games Hub placeholder catalog
│   │   └── tips/
│   │       └── page.tsx              # Anonymous Tipline submission form
│   ├── (ott)/
│   │   └── plus/
│   │       ├── page.tsx              # FTN+ Full-Page Dark Mode OTT Streaming Hub
│   │       ├── watch/[id]/page.tsx   # Video/Livestream playback theater
│   │       └── watchlist/page.tsx    # Authenticated user saved watchlist
│   ├── (admin)/                      # Role-protected administration suites
│   │   └── admin/
│   │       ├── page.tsx              # Admin overview & quick metrics
│   │       ├── roles/page.tsx        # User role assignment (Root Admin / Manager)
│   │       ├── articles/page.tsx     # Article drafting & rich text publishing suite
│   │       ├── sports/page.tsx       # League management, scoring rules & score entry
│   │       ├── radio/page.tsx        # Radio timetable & show lineup management
│   │       ├── ads/page.tsx          # Ad creative uploads, links & scheduling
│   │       └── tips/page.tsx         # Anonymous tip review console
│   ├── api/                          # Next.js Edge Route Handlers
│   │   ├── auth/
│   │   │   ├── roblox/route.ts       # Roblox OAuth initiate & callback
│   │   │   ├── session/route.ts      # Current session & role resolver
│   │   │   └── logout/route.ts       # Session termination
│   │   ├── articles/route.ts         # Article CRUD & comments
│   │   ├── sync/
│   │   │   └── youtube/route.ts      # Automated YouTube channel sync endpoint
│   │   ├── radio/
│   │   │   └── metadata/route.ts     # Icecast now-playing metadata proxy
│   │   ├── sports/
│   │   │   ├── leagues/route.ts      # League & scoring configuration
│   │   │   ├── fixtures/route.ts     # Match/race fixture & result recording
│   │   │   └── standings/route.ts    # Dynamic standings calculation endpoint
│   │   ├── ads/route.ts              # Ad rotation & impression/click tracker
│   │   └── tips/route.ts             # Anonymous tip submission endpoint
│   ├── layout.tsx                    # Root layout with Tailwind, fonts, and Audio Player Dock
│   └── globals.css                   # Tailwind CSS global styles
├── components/                       # Aceternity UI & shadcn pre-built components
│   ├── ui/                           # Installed shadcn & @aceternity Lego blocks
│   ├── layout/                       # Global Navbar, Footer, Audio Player Dock
│   ├── ott/                          # FTN+ Hero, Carousel Row, Watchlist Card
│   ├── sports/                       # Standings Table, Fixture Card, Calendar
│   ├── editor/                       # Rich text editor component for publishing
│   └── ads/                          # Ad Banner Zone wrapper
├── db/                               # Cloudflare D1 Database schema & migrations
│   ├── schema.ts                     # Drizzle ORM schema definition
│   └── index.ts                      # D1 client connection binding
├── lib/                              # Shared utilities, auth helpers, API clients
│   ├── auth.ts                       # Roblox OAuth & JWT session utilities
│   ├── rbac.ts                       # Division role permission gates
│   ├── youtube.ts                    # YouTube Data API sync client
│   ├── icecast.ts                    # Icecast stream & metadata parser
│   └── utils.ts                      # cn() helper and formatting
├── components.json                   # shadcn config with @aceternity custom registry
├── drizzle.config.ts                 # Drizzle migration config for Cloudflare D1
├── wrangler.toml                     # Cloudflare Pages / D1 / KV binding configuration
├── package.json                      # Project dependencies and build scripts
├── tsconfig.json                     # TypeScript configuration
└── tailwind.config.ts                # Tailwind CSS configuration with animations
```

**Structure Decision**: Web application utilizing Next.js App Router on Cloudflare Pages. Routes are partitioned logically into public pages, full-page OTT (`plus`), and role-gated admin consoles (`admin`), with shared UI components cleanly sourced from `@aceternity` and `@shadcn` registries.

---

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| None | N/A | Fully compliant with Project Constitution and Cloudflare free-tier serverless design |

