# Data Model Specification: FTN Media Group Platform

**Database Engine**: Cloudflare D1 (Serverless SQLite) with Drizzle ORM
**Feature Branch**: `001-ftn-media-platform`

---

## 1. Identity & Role-Based Access Control (RBAC)

### `users`
Represents visitors who have authenticated with Roblox.
- `id` (TEXT, Primary Key, UUID)
- `roblox_user_id` (TEXT, Unique, Indexed, Not Null)
- `roblox_username` (TEXT, Not Null)
- `roblox_display_name` (TEXT, Not Null)
- `avatar_url` (TEXT, Nullable)
- `created_at` (INTEGER, Timestamp ms, Not Null)
- `updated_at` (INTEGER, Timestamp ms, Not Null)

### `user_roles`
Represents staff role grants assigned by `alphaze1` or Managers.
- `id` (TEXT, Primary Key, UUID)
- `user_id` (TEXT, Foreign Key -> `users.id`, Indexed, Not Null)
- `role` (TEXT, Not Null) — Enum: `site_admin`, `manager`, `broadcast_division`, `digital_publishing_division`, `advertising_commercial_division`, `graphic_design_division`, `sports_division`
- `granted_by` (TEXT, Foreign Key -> `users.id`, Not Null)
- `created_at` (INTEGER, Timestamp ms, Not Null)
- **Constraint**: Unique (`user_id`, `role`)

---

## 2. Editorial & News Publishing

### `articles`
Represents news stories and press reports.
- `id` (TEXT, Primary Key, UUID)
- `slug` (TEXT, Unique, Indexed, Not Null)
- `title` (TEXT, Not Null)
- `summary` (TEXT, Not Null)
- `content_json` (TEXT, Rich text document state, Not Null)
- `content_html` (TEXT, Rendered markup, Not Null)
- `author_id` (TEXT, Foreign Key -> `users.id`, Not Null)
- `category` (TEXT, Indexed, Not Null) — e.g. `Politics`, `Ro-State Affairs`, `Business`, `Entertainment`, `Sports`
- `tags_json` (TEXT, JSON array of strings, Nullable)
- `cover_image_url` (TEXT, Nullable)
- `visibility` (TEXT, Not Null, Default: `public`) — Enum: `public`, `unlisted`, `private`
- `status` (TEXT, Not Null, Default: `draft`) — Enum: `draft`, `published`, `scheduled`
- `published_at` (INTEGER, Timestamp ms, Nullable, Indexed)
- `created_at` (INTEGER, Timestamp ms, Not Null)
- `updated_at` (INTEGER, Timestamp ms, Not Null)

### `comments`
Represents user discussions under published articles.
- `id` (TEXT, Primary Key, UUID)
- `article_id` (TEXT, Foreign Key -> `articles.id`, Indexed, Not Null)
- `user_id` (TEXT, Foreign Key -> `users.id`, Indexed, Not Null)
- `content` (TEXT, Not Null)
- `status` (TEXT, Not Null, Default: `approved`) — Enum: `approved`, `flagged`, `hidden`
- `created_at` (INTEGER, Timestamp ms, Not Null)

---

## 3. FTN+ OTT Video Streaming & YouTube Ingestion

### `video_channels`
Configured YouTube channel sources for automated ingestion.
- `id` (TEXT, Primary Key, UUID)
- `youtube_channel_id` (TEXT, Unique, Not Null)
- `channel_title` (TEXT, Not Null)
- `is_active` (INTEGER, Boolean, Default: 1)
- `created_at` (INTEGER, Timestamp ms, Not Null)

### `video_items`
Ingested YouTube broadcasts, on-demand videos, and podcasts.
- `id` (TEXT, Primary Key, UUID)
- `youtube_video_id` (TEXT, Unique, Indexed, Not Null)
- `channel_id` (TEXT, Foreign Key -> `video_channels.id`, Not Null)
- `title` (TEXT, Not Null)
- `description` (TEXT, Not Null)
- `thumbnail_url` (TEXT, Not Null)
- `duration` (TEXT, Nullable) — ISO 8601 duration
- `published_at` (INTEGER, Timestamp ms, Indexed, Not Null)
- `live_broadcast_status` (TEXT, Not Null, Default: `none`) — Enum: `none`, `upcoming`, `live`, `completed`
- `category` (TEXT, Not Null, Default: `General`)
- `is_podcast` (INTEGER, Boolean, Default: 0)
- `view_count` (INTEGER, Default: 0)
- `created_at` (INTEGER, Timestamp ms, Not Null)
- `updated_at` (INTEGER, Timestamp ms, Not Null)

### `watchlists`
User saved video items.
- `id` (TEXT, Primary Key, UUID)
- `user_id` (TEXT, Foreign Key -> `users.id`, Indexed, Not Null)
- `video_id` (TEXT, Foreign Key -> `video_items.id`, Indexed, Not Null)
- `created_at` (INTEGER, Timestamp ms, Not Null)
- **Constraint**: Unique (`user_id`, `video_id`)

---

## 4. FTN Sports Hub & Standings Engine

### `sports_leagues`
Leagues or racing series definitions.
- `id` (TEXT, Primary Key, UUID)
- `name` (TEXT, Not Null)
- `slug` (TEXT, Unique, Indexed, Not Null)
- `sport_type` (TEXT, Not Null) — e.g. `Hockey`, `Football`, `Motorsport`, `Racing`
- `season` (TEXT, Not Null)
- `scoring_type` (TEXT, Not Null) — Enum: `standard_match`, `racing_points`
- `scoring_config_json` (TEXT, Not Null) — Rules: `{ win: 3, draw: 1, loss: 0, ot_loss: 1 }` or `{ "1": 25, "2": 18, "3": 15, ... }`
- `is_active` (INTEGER, Boolean, Default: 1)
- `created_at` (INTEGER, Timestamp ms, Not Null)
- `updated_at` (INTEGER, Timestamp ms, Not Null)

### `sports_teams`
Teams or racers participating in a league.
- `id` (TEXT, Primary Key, UUID)
- `league_id` (TEXT, Foreign Key -> `sports_leagues.id`, Indexed, Not Null)
- `name` (TEXT, Not Null)
- `short_name` (TEXT, Not Null)
- `logo_url` (TEXT, Nullable)
- `color_hex` (TEXT, Nullable)
- `created_at` (INTEGER, Timestamp ms, Not Null)

### `sports_fixtures`
Matches or race events.
- `id` (TEXT, Primary Key, UUID)
- `league_id` (TEXT, Foreign Key -> `sports_leagues.id`, Indexed, Not Null)
- `home_team_id` (TEXT, Foreign Key -> `sports_teams.id`, Nullable)
- `away_team_id` (TEXT, Foreign Key -> `sports_teams.id`, Nullable)
- `scheduled_at` (INTEGER, Timestamp ms, Indexed, Not Null)
- `venue` (TEXT, Nullable)
- `status` (TEXT, Not Null, Default: `scheduled`) — Enum: `scheduled`, `in_progress`, `completed`, `postponed`
- `home_score` (INTEGER, Nullable)
- `away_score` (INTEGER, Nullable)
- `results_json` (TEXT, Full race classification / score breakdown, Nullable)
- `created_at` (INTEGER, Timestamp ms, Not Null)
- `updated_at` (INTEGER, Timestamp ms, Not Null)

### `sports_standings`
Pre-calculated dynamic standings cached per league.
- `id` (TEXT, Primary Key, UUID)
- `league_id` (TEXT, Foreign Key -> `sports_leagues.id`, Indexed, Not Null)
- `team_id` (TEXT, Foreign Key -> `sports_teams.id`, Indexed, Not Null)
- `played` (INTEGER, Default: 0)
- `won` (INTEGER, Default: 0)
- `lost` (INTEGER, Default: 0)
- `tied` (INTEGER, Default: 0)
- `overtime_loss` (INTEGER, Default: 0)
- `points` (INTEGER, Default: 0)
- `goals_for` (INTEGER, Default: 0)
- `goals_against` (INTEGER, Default: 0)
- `goal_difference` (INTEGER, Default: 0)
- `rank` (INTEGER, Default: 1)
- `updated_at` (INTEGER, Timestamp ms, Not Null)
- **Constraint**: Unique (`league_id`, `team_id`)

---

## 5. FTN Web Radio Hub

### `radio_shows`
Schedule entries for FTN Web Radio programming.
- `id` (TEXT, Primary Key, UUID)
- `title` (TEXT, Not Null)
- `host_name` (TEXT, Not Null)
- `description` (TEXT, Not Null)
- `day_of_week` (INTEGER, 0=Sun .. 6=Sat, Not Null)
- `start_time_utc` (TEXT, Format `HH:MM`, Not Null)
- `end_time_utc` (TEXT, Format `HH:MM`, Not Null)
- `is_recurring` (INTEGER, Boolean, Default: 1)
- `is_active` (INTEGER, Boolean, Default: 1)
- `created_at` (INTEGER, Timestamp ms, Not Null)
- `updated_at` (INTEGER, Timestamp ms, Not Null)

---

## 6. Advertising System

### `ad_campaigns`
Commercial banner ad rotation.
- `id` (TEXT, Primary Key, UUID)
- `name` (TEXT, Not Null)
- `slot_id` (TEXT, Indexed, Not Null) — Enum: `header_leaderboard`, `article_sidebar`, `feed_banner`, `footer_banner`
- `banner_image_url` (TEXT, Not Null)
- `target_url` (TEXT, Not Null)
- `weight` (INTEGER, Default: 1)
- `start_date` (INTEGER, Timestamp ms, Not Null)
- `end_date` (INTEGER, Timestamp ms, Not Null)
- `is_active` (INTEGER, Boolean, Default: 1)
- `impressions_count` (INTEGER, Default: 0)
- `clicks_count` (INTEGER, Default: 0)
- `created_at` (INTEGER, Timestamp ms, Not Null)
- `updated_at` (INTEGER, Timestamp ms, Not Null)

---

## 7. Anonymous Tipline

### `anonymous_tips`
Confidential tip submissions (strictly zero visitor identifiers saved).
- `id` (TEXT, Primary Key, UUID)
- `tip_text` (TEXT, Not Null)
- `media_urls_json` (TEXT, Nullable)
- `status` (TEXT, Not Null, Default: `new`) — Enum: `new`, `reviewed`, `archived`
- `review_notes` (TEXT, Nullable)
- `created_at` (INTEGER, Timestamp ms, Indexed, Not Null)
