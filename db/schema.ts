import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// 1. Users (Roblox OAuth & Password Authenticated)
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  robloxId: text("roblox_id").unique(),
  robloxUsername: text("roblox_username").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 2. User Roles (RBAC)
export const userRoles = sqliteTable("user_roles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", {
    enum: [
      "site_admin",
      "manager",
      "broadcast_division",
      "digital_publishing",
      "commercial_division",
      "graphic_design",
      "sports_division",
    ],
  }).notNull(),
  assignedBy: text("assigned_by").references(() => users.id),
  assignedAt: integer("assigned_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 3. Articles (Digital Publishing Division)
export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  content: text("content").notNull(),
  coverImageUrl: text("cover_image_url"),
  category: text("category", {
    enum: ["news", "politics", "business", "technology", "entertainment", "opinion"],
  }).notNull().default("news"),
  status: text("status", {
    enum: ["draft", "published", "archived"],
  }).notNull().default("draft"),
  opinionRole: text("opinion_role"),
  opinionQuote: text("opinion_quote"),
  authorId: text("author_id").notNull().references(() => users.id),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 3b. Article Revisions / Version History
export const articleRevisions = sqliteTable("article_revisions", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  revertedFromVersion: integer("reverted_from_version"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  content: text("content").notNull(),
  coverImageUrl: text("cover_image_url"),
  category: text("category", {
    enum: ["news", "politics", "business", "technology", "entertainment", "opinion"],
  }).notNull().default("news"),
  status: text("status", {
    enum: ["draft", "published", "archived"],
  }).notNull().default("draft"),
  opinionRole: text("opinion_role"),
  opinionQuote: text("opinion_quote"),
  editedBy: text("edited_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 4. Comments (Article discussions)
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  status: text("status", {
    enum: ["visible", "hidden", "flagged"],
  }).notNull().default("visible"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 5. OTT Videos & Streams (FTN+ YouTube Data Ingestion)
export const videos = sqliteTable("videos", {
  id: text("id").primaryKey(),
  youtubeId: text("youtube_id").notNull().unique(),
  channelId: text("channel_id").notNull(),
  channelTitle: text("channel_title").notNull(),
  channelHandle: text("channel_handle"),
  channelLogoUrl: text("channel_logo_url"),
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url").notNull(),
  publishedAt: integer("published_at", { mode: "timestamp" }).notNull(),
  videoType: text("video_type", {
    enum: ["video", "livestream", "podcast"],
  }).notNull().default("video"),
  isLive: integer("is_live", { mode: "boolean" }).notNull().default(false),
  durationSeconds: integer("duration_seconds").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 6. User Watchlists (FTN+)
export const watchlists = sqliteTable("watchlists", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  videoId: text("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 7. Video Views Tracking (For 7-Day FTN+ Trending Calculations)
export const videoViews = sqliteTable("video_views", {
  id: text("id").primaryKey(),
  videoId: text("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  viewedAt: integer("viewed_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 8. Sports Leagues (FTN Sports)
export const leagues = sqliteTable("leagues", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sportType: text("sport_type", {
    enum: ["racing", "match_based"],
  }).notNull(),
  season: text("season").notNull(),
  pointSystemJson: text("point_system_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 9. Sports Fixtures & Matches
export const fixtures = sqliteTable("fixtures", {
  id: text("id").primaryKey(),
  leagueId: text("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
  homeTeamOrDriver: text("home_team_or_driver").notNull(),
  awayTeamOrDriver: text("away_team_or_driver"),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }).notNull(),
  status: text("status", {
    enum: ["scheduled", "in_progress", "completed", "cancelled"],
  }).notNull().default("scheduled"),
  resultsJson: text("results_json"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 10. Radio Shows & Timetable (FTN Radio)
export const radioShows = sqliteTable("radio_shows", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  hostName: text("host_name").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTimeUtc: text("start_time_utc").notNull(),
  endTimeUtc: text("end_time_utc").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 11. Advertising Campaigns (Commercial Division)
export const adCampaigns = sqliteTable("ad_campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  advertiserName: text("advertiser_name").notNull(),
  zone: text("zone", {
    enum: ["header_leaderboard", "sidebar_rectangle", "in_feed_banner"],
  }).notNull(),
  imageUrl: text("image_url").notNull(),
  targetUrl: text("target_url").notNull(),
  weight: integer("weight").notNull().default(1),
  startDate: integer("start_date", { mode: "timestamp" }).notNull(),
  endDate: integer("end_date", { mode: "timestamp" }).notNull(),
  status: text("status", {
    enum: ["active", "paused", "completed"],
  }).notNull().default("active"),
  impressionsCount: integer("impressions_count").notNull().default(0),
  clicksCount: integer("clicks_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 12. Anonymous Tipline Submissions (100% Tracking-Free)
export const tips = sqliteTable("tips", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  details: text("details").notNull(),
  contactChannel: text("contact_channel"),
  status: text("status", {
    enum: ["unread", "investigating", "dismissed", "published"],
  }).notNull().default("unread"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 13. Persistent Site Settings (Cloudflare D1 Stored Configuration)
export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(), // "general", "webradio", "youtube", "moderation", "swimlanes"
  valueJson: text("value_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 14. User Moderation (Mutes & Infractions)
export const userModeration = sqliteTable("user_moderation", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  duration: text("duration").notNull(), // "24h" | "1w" | "1m" | "indefinite"
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  moderatedBy: text("moderated_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
