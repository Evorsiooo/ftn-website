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

// 11a. Organizers (advertisers that own one or more ads)
export const organizers = sqliteTable("organizers", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  logoUrl: text("logo_url"),
  notes: text("notes"),
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
  // Posts feature: an ad belongs to an organizer (one organizer, many ads).
  organizerId: text("organizer_id").references(() => organizers.id, { onDelete: "set null" }),
  // Used in Discord posts; falls back to targetUrl when empty.
  messageLink: text("message_link"),
  // Post impressions bought for this ad (null = unlimited) and how many posts have used.
  postImpressionsPurchased: integer("post_impressions_purchased"),
  postImpressionsUsed: integer("post_impressions_used").notNull().default(0),
  adFormat: text("ad_format", { enum: ["1024x180", "512x180"] }).notNull().default("1024x180"),
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

// 15. Posts (generated post images, approved by leadership and published to Discord)
export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  headline: text("headline").notNull(),
  body: text("body").notNull().default(""),
  logo: text("logo").notNull().default(""),
  // Roblox Ro-State the post is for; decides which Discord feed it goes to.
  roState: text("ro_state", {
    enum: ["harrison", "ridgeway", "madison", "clark", "firestone", "international"],
  }).notNull(),
  // The ad used (null = boilerplate "your advertisement here"). Organizer name and links
  // are copied at creation so later ad edits do not change an existing post.
  adId: text("ad_id").references(() => adCampaigns.id, { onDelete: "set null" }),
  organizationName: text("organization_name"),
  messageLink: text("message_link"),
  backgroundUrl: text("background_url"),
  imageUrl: text("image_url").notNull(),
  status: text("status", {
    enum: ["pending", "approved", "denied"],
  }).notNull().default("pending"),
  denyReason: text("deny_reason"),
  decidedBy: text("decided_by").references(() => users.id),
  // Who decided, as shown in Discord ("Carol on the website" or a Discord name).
  decidedByLabel: text("decided_by_label"),
  decidedAt: integer("decided_at", { mode: "timestamp" }),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  // Filled in by the Discord integration.
  leadershipMessageId: text("leadership_message_id"),
  // JSON array of edit notes added after the post was made.
  amendments: text("amendments"),
  ftnPlusMessageId: text("ftn_plus_message_id"),
  feedChannelId: text("feed_channel_id"),
  feedMessageId: text("feed_message_id"),
});
