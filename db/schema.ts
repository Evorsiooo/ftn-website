import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

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

// 7b. Watch progress (FTN+ Continue watching). Keyed by YouTube id so curated external videos work too.
export const watchProgress = sqliteTable(
  "watch_progress",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    youtubeId: text("youtube_id").notNull(),
    positionSeconds: integer("position_seconds").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.youtubeId] }), index("watch_progress_user_updated_idx").on(t.userId, t.updatedAt)]
);

// 8. Sports (FTN+ Sports)
// A league is a racing series or a team competition; one active season per league.
// `rulesJson` holds the scoring rules (see lib/sports.ts).
export const sportsLeagues = sqliteTable("sports_leagues", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["racing", "team"] }).notNull(),
  sport: text("sport").notNull(),
  season: text("season").notNull(),
  color: text("color"),
  logoUrl: text("logo_url"),
  bannerUrl: text("banner_url"),
  // "points": standings use the points table in rulesJson; "order": finishing order only (wins, then podiums).
  scoring: text("scoring", { enum: ["points", "order"] }).notNull().default("points"),
  // Racing only: whether to publish a constructors' championship.
  constructors: integer("constructors", { mode: "boolean" }).notNull().default(true),
  rulesJson: text("rules_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Clubs for team sports, constructors for racing.
export const sportsTeams = sqliteTable("sports_teams", {
  id: text("id").primaryKey(),
  leagueId: text("league_id").notNull().references(() => sportsLeagues.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  shortName: text("short_name"),
  color: text("color"),
  logoUrl: text("logo_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Racing drivers (and co-drivers).
export const sportsDrivers = sqliteTable("sports_drivers", {
  id: text("id").primaryKey(),
  leagueId: text("league_id").notNull().references(() => sportsLeagues.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => sportsTeams.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  number: integer("number"),
  // Used to fetch the driver's Roblox headshot.
  robloxUsername: text("roblox_username"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Tracks and stages. The photo is uploaded by staff and shown on the hub, calendar and round pages.
export const sportsVenues = sqliteTable("sports_venues", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  photoUrl: text("photo_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// A match (team leagues) or a race/rally round (racing leagues).
// Matches use home/away team + scores; races use `resultsJson` (RaceResultEntry[]).
export const sportsEvents = sqliteTable("sports_events", {
  id: text("id").primaryKey(),
  leagueId: text("league_id").notNull().references(() => sportsLeagues.id, { onDelete: "cascade" }),
  name: text("name"),
  round: integer("round"),
  venue: text("venue"),
  venueId: text("venue_id").references(() => sportsVenues.id, { onDelete: "set null" }),
  // Optional round report: an existing published article.
  articleId: text("article_id").references(() => articles.id, { onDelete: "set null" }),
  startsAt: integer("starts_at", { mode: "timestamp" }).notNull(),
  status: text("status", {
    enum: ["scheduled", "final", "postponed", "cancelled"],
  }).notNull().default("scheduled"),
  homeTeamId: text("home_team_id").references(() => sportsTeams.id, { onDelete: "set null" }),
  awayTeamId: text("away_team_id").references(() => sportsTeams.id, { onDelete: "set null" }),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  overtime: integer("overtime", { mode: "boolean" }).notNull().default(false),
  resultsJson: text("results_json"),
  videoUrl: text("video_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 10. Radio Shows & Timetable (FTN Radio)
// A show carries the branding (name, presenter, album art); slots say when it airs.
export const radioShows = sqliteTable("radio_shows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  presenter: text("presenter").notNull(),
  description: text("description"),
  artUrl: text("art_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// A broadcast is one entry on the schedule: radio, a livestream, or both at once.
// Weekly entries repeat: dayOfWeek (0=Sunday) and startMinute are wall-clock values in `timezone`
// (an IANA zone), so they keep their local time across daylight-saving changes;
// one-off entries use startsAt/endsAt instead. Radio entries need a show (presenter, art).
// Livestreams live on YouTube; youtubeId optionally links the entry to its watch page.
// sportsEventId links a broadcast to a sports_events row (shows the Livestream / Radio badge on the event).
export const broadcasts = sqliteTable("broadcasts", {
  id: text("id").primaryKey(),
  showId: text("show_id").references(() => radioShows.id, { onDelete: "set null" }),
  title: text("title"),
  description: text("description"),
  onRadio: integer("on_radio", { mode: "boolean" }).notNull().default(true),
  onStream: integer("on_stream", { mode: "boolean" }).notNull().default(false),
  kind: text("kind", { enum: ["weekly", "once"] }).notNull().default("weekly"),
  tag: text("tag", { enum: ["live", "simulcast", "rebroadcast"] }).notNull().default("live"),
  status: text("status", { enum: ["scheduled", "cancelled"] }).notNull().default("scheduled"),
  timezone: text("timezone").notNull().default("UTC"),
  dayOfWeek: integer("day_of_week"),
  startMinute: integer("start_minute"),
  durationMinutes: integer("duration_minutes"),
  startsAt: integer("starts_at", { mode: "timestamp" }),
  endsAt: integer("ends_at", { mode: "timestamp" }),
  youtubeId: text("youtube_id"),
  sportsEventId: text("sports_event_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
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
  // True when the post was made with "No ad": no strip, no notice, image cropped to the box.
  noAd: integer("no_ad", { mode: "boolean" }).notNull().default(false),
  organizationName: text("organization_name"),
  messageLink: text("message_link"),
  backgroundUrl: text("background_url"),
  // For a video post, imageUrl is a still of the video and videoUrl is the MP4 itself.
  imageUrl: text("image_url").notNull(),
  mediaType: text("media_type", { enum: ["image", "video"] }).notNull().default("image"),
  videoUrl: text("video_url"),
  // JSON of the edit (sources and clips) so a video post can be opened in the editor again.
  videoEdit: text("video_edit"),
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
