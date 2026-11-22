import * as adsRoute from "@/app/api/admin/ads/route";
import * as adRoute from "@/app/api/admin/ads/[id]/route";
import * as organizersRoute from "@/app/api/admin/organizers/route";
import * as organizerRoute from "@/app/api/admin/organizers/[id]/route";
import * as statsRoute from "@/app/api/admin/stats/route";
import * as reportRoute from "@/app/api/admin/stats/report/route";
import { S, ToolDef, pick } from "../types";

const adFields = {
  title: S.str("Ad name, up to 150 characters"),
  organizerId: S.str("The organization it belongs to (list_organizations)"),
  imageUrl: S.str("The ad picture (1024x180, or 512x180 for a half-width ad). Use upload_image with folder ads first."),
  targetUrl: S.str("Where a click on the site goes"),
  messageLinks: S.obj("Optional Discord 'Learn more' link per Ro-State key, e.g. {\"harrison\": \"https://...\"}; falls back to targetUrl"),
  postImpressionsPurchased: S.int("Post impressions bought (each post that carries the ad uses one)"),
  format: S.enum(["1024x180", "512x180"], "Ad size"),
  zone: S.enum(["header_leaderboard", "in_feed_banner", "sidebar_rectangle"], "Where it shows on the site"),
  status: S.enum(["active", "paused", "completed"], "active ads show; paused ones don't"),
};
const AD_KEYS = Object.keys(adFields);

export const adTools: ToolDef[] = [
  {
    name: "list_ads",
    title: "List ads",
    description: "Every ad with its organization, status, impressions left and clicks.",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(adsRoute.GET, { path: "/api/admin/ads" }),
  },
  {
    name: "create_ad",
    title: "Create an ad",
    description: "Adds an ad for an organization.",
    input: adFields,
    required: ["title", "organizerId", "imageUrl", "targetUrl"],
    kind: "write",
    refs: { organizerId: "organization" },
    summary: (a) => `Create ad "${a.title}"`,
    run: (ctx, a) => ctx.call(adsRoute.POST, { method: "POST", path: "/api/admin/ads", body: pick(a, AD_KEYS) }),
  },
  {
    name: "update_ad",
    title: "Edit an ad",
    description: "Changes an ad: only the fields given. Pause it with status paused.",
    input: { id: S.str("The ad's id"), ...adFields },
    required: ["id"],
    kind: "write",
    refs: { id: "ad", organizerId: "organization" },
    summary: (a) => `Edit ad ${a.id}${a.status ? ` (${a.status})` : ""}`,
    run: (ctx, a) => ctx.call(adRoute.PATCH, { method: "PATCH", path: `/api/admin/ads/${a.id}`, params: { id: a.id }, body: pick(a, AD_KEYS) }),
  },
  {
    name: "delete_ad",
    title: "Delete an ad",
    description: "Deletes an ad for good. Needs the person's approval on the site.",
    input: { id: S.str("The ad's id") },
    required: ["id"],
    kind: "danger",
    refs: { id: "ad" },
    summary: (a) => `Delete ad ${a.id}`,
    run: (ctx, a) => ctx.call(adsRoute.DELETE, { method: "DELETE", path: "/api/admin/ads", query: { id: a.id } }),
  },
  {
    name: "list_organizations",
    title: "List ad organizations",
    description: "Organizations that buy ads.",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(organizersRoute.GET, { path: "/api/admin/organizers" }),
  },
  {
    name: "create_organization",
    title: "Add an ad organization",
    description: "Adds an organization that buys ads.",
    input: { name: S.str("Organization name"), notes: S.str("Internal notes") },
    required: ["name"],
    kind: "write",
    summary: (a) => `Add organization "${a.name}"`,
    run: (ctx, a) => ctx.call(organizersRoute.POST, { method: "POST", path: "/api/admin/organizers", body: pick(a, ["name", "notes"]) }),
  },
  {
    name: "update_organization",
    title: "Edit an ad organization",
    description: "Renames an organization or changes its notes.",
    input: { id: S.str("The organization's id"), name: S.str("New name"), notes: S.str("Internal notes") },
    required: ["id"],
    kind: "write",
    refs: { id: "organization" },
    summary: (a) => `Edit organization ${a.name || a.id}`,
    run: (ctx, a) => ctx.call(organizerRoute.PATCH, { method: "PATCH", path: `/api/admin/organizers/${a.id}`, params: { id: a.id }, body: pick(a, ["name", "notes"]) }),
  },
  {
    name: "delete_organization",
    title: "Delete an ad organization",
    description: "Deletes an organization. Needs the person's approval on the site.",
    input: { id: S.str("The organization's id") },
    required: ["id"],
    kind: "danger",
    refs: { id: "organization" },
    summary: (a) => `Delete organization ${a.id}`,
    run: (ctx, a) => ctx.call(organizerRoute.DELETE, { method: "DELETE", path: `/api/admin/organizers/${a.id}`, params: { id: a.id } }),
  },
  {
    name: "get_stats",
    title: "Site statistics",
    description: "One part of the Stats page over the last 1, 7, 30 or 90 days: site (visits, ads), radio (listeners), plus (FTN+ views) or posts.",
    input: { tab: S.enum(["site", "radio", "plus", "posts"], "Which statistics"), days: S.enum(["1", "7", "30", "90"], "How many days back (default 30)") },
    required: ["tab"],
    kind: "read",
    run: (ctx, a) => ctx.call(statsRoute.GET, { path: "/api/admin/stats", query: { tab: a.tab, days: a.days || "30" } }),
  },
  {
    name: "get_ad_report",
    title: "Ad report for an organization",
    description: "The report sent to an organization: its ads' impressions and clicks over N days.",
    input: { org: S.str("The organization's id"), days: S.enum(["7", "30", "90", "365"], "How many days back (default 30)") },
    required: ["org"],
    kind: "read",
    run: (ctx, a) => ctx.call(reportRoute.GET, { path: "/api/admin/stats/report", query: { org: a.org, days: a.days } }),
  },
];
