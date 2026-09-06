# Technical Research & Architecture Decisions: FTN Media Group Platform

**Feature Branch**: `001-ftn-media-platform`
**Date**: 2026-08-18

---

## 1. Hosting & Deployment Framework

- **Decision**: Next.js App Router (TypeScript) deployed to **Cloudflare Pages** via `@cloudflare/next-on-pages` (or OpenNext for Cloudflare).
- **Rationale**: 
  - Seamless edge deployment on Cloudflare Pages (free tier includes unlimited bandwidth and 500 builds/month).
  - Native support for both server-rendered static/dynamic pages and client components required by Aceternity UI (`framer-motion`, animated borders, hero cards).
  - Built-in Next.js Route Handlers (`/api/*`) running as Cloudflare edge functions.
- **Alternatives Considered**:
  - *Vite + React SPA*: Requires separate API server or complex edge worker glue; lacks out-of-the-box SEO optimization for public news articles.
  - *Astro*: High performance for static content, but higher friction when composing React-heavy, Framer Motion-driven streaming and interactive dashboards.

---

## 2. Component Assembly & Styling Engine

- **Decision**: Tailwind CSS + `shadcn` CLI configured with the `@aceternity` registry in `components.json` (`"@aceternity": "https://ui.aceternity.com/registry/{name}.json"`), `framer-motion`, `lucide-react`, `clsx`, `tailwind-merge`.
- **Rationale**:
  - Direct compliance with the Project Constitution (Component Assembly Law).
  - Allows discovery and installation of Aceternity components via `shadcn` MCP / CLI (`npx shadcn@latest add @aceternity/<component>`).
  - Strict Lego-block assembly without modifying internal component CSS or animation primitives.
- **Foundation Order**:
  1. Initialize Next.js project with Tailwind CSS and path aliases (`@/*`).
  2. Run `shadcn init` to generate `components.json`.
  3. Register `"@aceternity": "https://ui.aceternity.com/registry/{name}.json"` in `components.json` under `registries`.
  4. Assemble global application shell (Navbar, Footer, Audio Player Dock) before building out feature-specific page routes.

---

## 3. Storage & Relational Database

- **Decision**: **Cloudflare D1** (Serverless distributed SQLite database) with **Drizzle ORM**.
- **Rationale**:
  - Generous free tier (5M reads/day, 100k writes/day, 5GB storage).
  - Direct zero-latency edge bindings within Cloudflare Pages Functions (`env.DB`).
  - Full relational schema support with ACID transactions, indices, and type-safe migrations via Drizzle ORM for articles, comments, sports leagues, fixtures, standings, ad campaigns, radio schedules, and RBAC tables.
- **Alternatives Considered**:
  - *Supabase PostgreSQL*: Introduces external network hops from Cloudflare Edge; free tier pauses on inactivity.
  - *Cloudflare KV alone*: Inadequate for relational queries (standings calculations, user role filters, categorized article queries).

---

## 4. Caching & Edge Rate Limiting

- **Decision**: **Cloudflare KV** and Edge Cache Headers for external API integration caching.
- **Rationale**:
  - Caches YouTube channel sync responses (5-minute TTL) to stay well within YouTube Data API v3 free daily quotas (10,000 units/day).
  - Caches Icecast stream status and now-playing metadata (15-second TTL) to protect the broadcast server from client polling stampedes.

---

## 5. Roblox Authentication & Role-Based Access Control (RBAC)

- **Decision**: Roblox OAuth2 authorization code flow with secure HTTP-only session cookies and D1 role verification.
  - Root admin rule: `alphaze1` is automatically seeded and validated as root `Site Administrator` on initial authentication.
  - 7 defined division roles stored in `user_roles` with route-level middleware protection.
- **Rationale**:
  - Standard, secure OAuth2 flow requesting `openid`, `profile`.
  - No plaintext credentials or passwords stored.

---

## 6. Video Ingestion & FTN+ OTT Platform

- **Decision**: Automated background/webhook/polling synchronization pulling from configured YouTube channel IDs, storing video metadata (`title`, `description`, `thumbnail_url`, `published_at`, `status`, `duration`) in D1.
- **Rationale**:
  - Zero manual staff publishing required for video journalism and podcasts.
  - YouTube player iframes deliver zero-bandwidth video streaming directly inside the dark-mode FTN+ OTT interface.

---

## 7. FTN Sports Calculation Engine

- **Decision**: In-database formula-driven scoring engine supporting:
  - Ball/Team sports: Configurable points for Win, Regulation Loss, Overtime/Shootout Loss, Draw.
  - Motorsports / Racing series: Position-to-points mapping tables (e.g., 1st: 25pts, 2nd: 18pts, etc.).
- **Rationale**:
  - Recalculates standings atomically within D1 transactions whenever match/race scores are confirmed.
