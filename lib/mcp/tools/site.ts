import * as sportsRoute from "@/app/api/sports/[entity]/route";
import * as sportsDataRoute from "@/app/api/sports/data/route";
import * as tipsRoute from "@/app/api/admin/tips/route";
import * as usersRoute from "@/app/api/admin/users/route";
import * as rolesRoute from "@/app/api/admin/roles/route";
import * as employeesRoute from "@/app/api/admin/employees/route";
import * as moderationRoute from "@/app/api/admin/moderation/route";
import * as configRoute from "@/app/api/radio/config/route";
import * as radioSettingsRoute from "@/app/api/admin/radio/settings/route";
import * as passwordRoute from "@/app/api/admin/radio/password/route";
import * as diagnoseRoute from "@/app/api/admin/radio/diagnose/route";
import * as youtubeRoute from "@/app/api/sync/youtube/route";
import * as videosRoute from "@/app/api/plus/videos/route";
import * as uploadRoute from "@/app/api/upload/route";
import { S, ToolDef, ToolError, pick } from "../types";

const ENTITIES = ["leagues", "teams", "drivers", "venues", "events"] as const;
const ROLES = ["site_admin", "manager", "broadcast_division", "digital_publishing", "commercial_division", "graphic_design", "sports_division"] as const;

const SPORTS_FIELDS =
  "Fields by type. leagues: name, kind (racing|team), sport, season, scoring (points|order), constructors, color (#RRGGBB), logoUrl, bannerUrl, rules. " +
  "teams: leagueId, name, shortName, color, logoUrl. drivers: leagueId, name, teamId, number, robloxUsername. venues: name, photoUrl. " +
  "events: leagueId, startsAt (ISO), name, round, venueId or venue, status (scheduled|final|postponed|cancelled), homeTeamId, awayTeamId, homeScore, awayScore, overtime, results (racing results), articleId, videoUrl.";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE = 10 * 1024 * 1024;

export const siteTools: ToolDef[] = [
  // ── uploads ──
  {
    name: "upload_image",
    title: "Upload an image",
    description:
      "Copies an image from a public URL into FTN's storage and returns its FTN URL, to use as an article cover, ad picture, show art, team logo... (JPEG, PNG, WebP or GIF, up to 10 MB).",
    input: { url: S.str("Public https URL of the image"), folder: S.enum(["articles", "ads", "posts", "radio", "sports"], "Where it's used") },
    required: ["url", "folder"],
    kind: "write",
    openWorld: true,
    summary: (a) => `Upload image to ${a.folder} from ${a.url}`,
    run: async (ctx, a) => {
      let u: URL;
      try {
        u = new URL(a.url);
      } catch {
        throw new ToolError("That isn't a valid URL.");
      }
      if (u.protocol !== "https:") throw new ToolError("Only https image links are accepted.");
      const res = await fetch(u.toString(), { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new ToolError(`Couldn't download the image (HTTP ${res.status}).`);
      const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!IMAGE_TYPES.includes(type)) throw new ToolError(`That link isn't a JPEG, PNG, WebP or GIF image (it's ${type || "unknown"}).`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_IMAGE) throw new ToolError("The image is over 10 MB.");
      const ext = type.split("/")[1].replace("jpeg", "jpg");
      const form = new FormData();
      form.set("file", new File([buf], `image.${ext}`, { type }));
      form.set("folder", a.folder);
      return ctx.call(uploadRoute.POST, { method: "POST", path: "/api/upload", form });
    },
  },
  // ── sports ──
  {
    name: "get_sports",
    title: "Sports data",
    description: "All leagues, teams, drivers, venues and events (with results), as the sports pages use them.",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(sportsDataRoute.GET, { path: "/api/sports/data" }),
  },
  {
    name: "create_sports_item",
    title: "Add a league, team, driver, venue or event",
    description: `Adds a sports item. ${SPORTS_FIELDS}`,
    input: { type: S.enum(ENTITIES, "What to add"), fields: S.obj("The item's fields (see the description)") },
    required: ["type", "fields"],
    kind: "write",
    summary: (a) => `Add ${String(a.type).replace(/s$/, "")} ${a.fields?.name ? `"${a.fields.name}"` : ""}`,
    run: (ctx, a) => ctx.call(sportsRoute.POST, { method: "POST", path: `/api/sports/${a.type}`, params: { entity: a.type }, body: a.fields || {} }),
  },
  {
    name: "update_sports_item",
    title: "Edit a sports item",
    description: `Changes a league, team, driver, venue or event: only the fields given (e.g. an event's scores and status final). ${SPORTS_FIELDS}`,
    input: { type: S.enum(ENTITIES, "What it is"), id: S.str("Its id (get_sports)"), fields: S.obj("The fields to change") },
    required: ["type", "id", "fields"],
    kind: "write",
    refs: { id: "sports" },
    summary: (a) => `Edit ${String(a.type).replace(/s$/, "")} ${a.id}`,
    run: (ctx, a) => ctx.call(sportsRoute.PATCH, { method: "PATCH", path: `/api/sports/${a.type}`, params: { entity: a.type }, query: { id: a.id }, body: a.fields || {} }),
  },
  {
    name: "delete_sports_item",
    title: "Delete a sports item",
    description: "Deletes a league, team, driver, venue or event. Needs the person's approval on the site.",
    input: { type: S.enum(ENTITIES, "What it is"), id: S.str("Its id") },
    required: ["type", "id"],
    kind: "danger",
    refs: { id: "sports" },
    summary: (a) => `Delete ${String(a.type).replace(/s$/, "")} ${a.id}`,
    run: (ctx, a) => ctx.call(sportsRoute.DELETE, { method: "DELETE", path: `/api/sports/${a.type}`, params: { entity: a.type }, query: { id: a.id } }),
  },
  // ── tip line ──
  {
    name: "list_tips",
    title: "Tip line",
    description: "Tips readers sent, with their status (unread, investigating, dismissed, published).",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(tipsRoute.GET, { path: "/api/admin/tips" }),
  },
  {
    name: "set_tip_status",
    title: "Mark a tip",
    description: "Sets a tip's status.",
    input: { id: S.str("The tip's id"), status: S.enum(["unread", "investigating", "dismissed", "published"], "New status") },
    required: ["id", "status"],
    kind: "write",
    summary: (a) => `Mark tip ${a.id} ${a.status}`,
    run: (ctx, a) => ctx.call(tipsRoute.PUT, { method: "PUT", path: "/api/admin/tips", body: pick(a, ["id", "status"]) }),
  },
  {
    name: "dismiss_all_tips",
    title: "Dismiss all unread tips",
    description: "Marks every unread tip dismissed. Needs the person's approval on the site.",
    input: {},
    kind: "danger",
    summary: () => "Dismiss all unread tips",
    run: (ctx) => ctx.call(tipsRoute.PUT, { method: "PUT", path: "/api/admin/tips", body: { action: "dismiss_all" } }),
  },
  {
    name: "block_tip_sender",
    title: "Block a tip's sender",
    description: "Blocks whoever sent this tip from sending more, and dismisses it. Needs the person's approval on the site.",
    input: { id: S.str("The tip's id") },
    required: ["id"],
    kind: "danger",
    summary: (a) => `Block the sender of tip ${a.id}`,
    run: (ctx, a) => ctx.call(tipsRoute.PUT, { method: "PUT", path: "/api/admin/tips", body: { action: "blacklist", id: a.id } }),
  },
  // ── people ──
  {
    name: "list_users",
    title: "Find people",
    description: "Site accounts with their roles. search matches the Roblox username or display name.",
    input: { search: S.str("Name to look for") },
    kind: "read",
    run: (ctx, a) => ctx.call(usersRoute.GET, { path: "/api/admin/users", query: { search: a.search } }),
  },
  {
    name: "list_staff_accounts",
    title: "Staff accounts",
    description: "Staff accounts, including which have a password login.",
    input: { search: S.str("Name to look for") },
    kind: "read",
    run: (ctx, a) => ctx.call(employeesRoute.GET, { path: "/api/admin/employees", query: { search: a.search } }),
  },
  {
    name: "set_role",
    title: "Give or remove a role",
    description: "Gives a person a staff role or removes it. Needs the person's approval on the site.",
    input: { userId: S.str("The person's id (list_users)"), role: S.enum(ROLES, "The role"), action: S.enum(["grant", "revoke"], "grant gives it, revoke removes it") },
    required: ["userId", "role", "action"],
    kind: "danger",
    refs: { userId: "user" },
    summary: (a) => `${a.action === "grant" ? "Give" : "Remove"} the ${String(a.role).replace(/_/g, " ")} role ${a.action === "grant" ? "to" : "from"} ${a.userId}`,
    run: (ctx, a) => ctx.call(rolesRoute.POST, { method: "POST", path: "/api/admin/roles", body: { targetUserId: a.userId, role: a.role, action: a.action } }),
  },
  {
    name: "manage_staff_account",
    title: "Create, rename, reset or delete a staff account",
    description:
      "create {username: Roblox username} makes an account (a password login is generated); reset_password {userId}; rename {userId, newUsername}; delete {userId}. Passwords show only on the approval page, never to the AI. Needs the person's approval on the site.",
    input: {
      action: S.enum(["create", "reset_password", "rename", "delete"], "What to do"),
      username: S.str("create: the Roblox username"),
      userId: S.str("The account's id"),
      newUsername: S.str("rename: the new username"),
    },
    required: ["action"],
    kind: "danger",
    refs: { userId: "user" },
    summary: (a) =>
      a.action === "create" ? `Create staff account ${a.username}` : a.action === "rename" ? `Rename account ${a.userId} to ${a.newUsername}` : `${a.action === "delete" ? "Delete" : "Reset the password of"} account ${a.userId}`,
    run: (ctx, a) => {
      const action = { create: "create", reset_password: "reset_password", rename: "update_username", delete: "delete_user" }[a.action as string];
      if (!action) throw new ToolError("Unknown action.");
      return ctx.call(employeesRoute.POST, { method: "POST", path: "/api/admin/employees", body: { action, ...pick(a, ["username", "userId", "newUsername"]) } });
    },
  },
  {
    name: "list_mutes",
    title: "Muted and banned people",
    description: "People who are muted (chat, comments) and until when.",
    input: { userId: S.str("Only this person") },
    kind: "read",
    run: (ctx, a) => ctx.call(moderationRoute.GET, { path: "/api/admin/moderation", query: { userId: a.userId } }),
  },
  {
    name: "mute_user",
    title: "Mute someone",
    description: "Mutes a person for 24 hours, a week, a month or for good. Needs the person's approval on the site.",
    input: { userId: S.str("The person's id"), duration: S.enum(["24h", "1w", "1m", "indefinite"], "How long"), reason: S.str("Why") },
    required: ["userId", "duration"],
    kind: "danger",
    refs: { userId: "user" },
    summary: (a) => `Mute user ${a.userId} for ${a.duration}${a.reason ? `: ${a.reason}` : ""}`,
    run: (ctx, a) => ctx.call(moderationRoute.POST, { method: "POST", path: "/api/admin/moderation", body: pick(a, ["userId", "duration", "reason"]) }),
  },
  {
    name: "unmute_user",
    title: "Lift a mute",
    description: "Lifts a mute (by mute id from list_mutes, or every mute of a person). Needs the person's approval on the site.",
    input: { id: S.str("The mute's id"), userId: S.str("Or: lift every mute of this person") },
    kind: "danger",
    refs: { userId: "user" },
    summary: (a) => (a.id ? `Lift mute ${a.id}` : `Lift all mutes of user ${a.userId}`),
    run: (ctx, a) => ctx.call(moderationRoute.DELETE, { method: "DELETE", path: "/api/admin/moderation", query: { id: a.id, userId: a.userId } }),
  },
  // ── settings and FTN+ ──
  {
    name: "get_site_settings",
    title: "Site settings",
    description: "Site-wide settings: sign-in, who sees FTN+ and the tip line, auto-mod and banned words, YouTube/Twitch channels, home page rows, hidden videos, links, donation banner.",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(configRoute.GET, { path: "/api/radio/config" }),
  },
  {
    name: "update_site_settings",
    title: "Change site settings",
    description:
      "Changes site settings: only the fields given (same names as get_site_settings, e.g. donationBannerEnabled, bannedWords, autoModEnabled, youtubeChannels, twitchChannels, hiddenVideoIds, socialLinks, discordUrl, ftnPlusAccess, tiplineAccess, allowSignIn, authMode). Needs the person's approval on the site.",
    input: { settings: S.obj("The settings to change") },
    required: ["settings"],
    kind: "danger",
    summary: (a) => `Change site settings: ${Object.keys(a.settings || {}).join(", ")}`,
    run: (ctx, a) => {
      const s = { ...(a.settings || {}) };
      delete s.action;
      return ctx.call(configRoute.POST, { method: "POST", path: "/api/radio/config", body: s });
    },
  },
  {
    name: "remove_ftnplus_video",
    title: "Remove a video from FTN+",
    description: "Removes a video from FTN+ (it can come back at the next YouTube sync unless hidden in the settings). Needs the person's approval on the site.",
    input: { videoId: S.str("YouTube video id") },
    required: ["videoId"],
    kind: "danger",
    summary: (a) => `Remove video ${a.videoId} from FTN+`,
    run: (ctx, a) => ctx.call(configRoute.POST, { method: "POST", path: "/api/radio/config", body: { action: "delete_video", videoId: a.videoId } }),
  },
  {
    name: "list_ftnplus_videos",
    title: "FTN+ videos",
    description: "Videos on FTN+ (synced from the YouTube channels).",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(videosRoute.GET, { path: "/api/plus/videos" }),
  },
  {
    name: "sync_youtube",
    title: "Sync YouTube now",
    description: "Fetches new videos from the YouTube channels now (one channel, or all).",
    input: { channelId: S.str("Only this channel (optional)") },
    kind: "write",
    openWorld: true,
    summary: (a) => `Sync YouTube${a.channelId ? ` channel ${a.channelId}` : ""}`,
    run: (ctx, a) => ctx.call(youtubeRoute.POST, { method: "POST", path: "/api/sync/youtube", body: a.channelId ? { channelId: a.channelId } : {} }),
  },
  {
    name: "get_radio_settings",
    title: "Radio settings",
    description: "Station and stream settings (secret keys are hidden).",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(radioSettingsRoute.GET, { path: "/api/admin/radio/settings" }),
  },
  {
    name: "update_radio_settings",
    title: "Change radio settings",
    description: "Changes radio settings: public (station) and/or secure (stream, Icecast) fields, as in get_radio_settings. Needs the person's approval on the site.",
    input: { public: S.obj("Public station settings to change"), secure: S.obj("Stream / Icecast settings to change") },
    kind: "danger",
    summary: (a) => `Change radio settings: ${[...Object.keys(a.public || {}), ...Object.keys(a.secure || {})].join(", ")}`,
    run: (ctx, a) => ctx.call(radioSettingsRoute.POST, { method: "POST", path: "/api/admin/radio/settings", body: pick(a, ["public", "secure"]) }),
  },
  {
    name: "reset_stream_password",
    title: "Reset the OBS stream password",
    description: "Makes a new password for broadcasting from OBS (the old one stops working). The password shows only on the approval page. Needs the person's approval on the site.",
    input: {},
    kind: "danger",
    openWorld: true,
    summary: () => "Reset the OBS stream password",
    run: (ctx) => ctx.call(passwordRoute.POST, { method: "POST", path: "/api/admin/radio/password", body: {} }),
  },
  {
    name: "check_radio",
    title: "Check the radio",
    description: "Runs the radio's connection checks (storage, downloader, Icecast) and says what's wrong, if anything.",
    input: {},
    kind: "read",
    openWorld: true,
    run: (ctx) => ctx.call(diagnoseRoute.GET, { path: "/api/admin/radio/diagnose" }),
  },
];
