import * as postsRoute from "@/app/api/admin/posts/route";
import * as postRoute from "@/app/api/admin/posts/[id]/route";
import * as optionsRoute from "@/app/api/admin/posts/options/route";
import * as scheduleRoute from "@/app/api/admin/posts/[id]/schedule/route";
import * as amendRoute from "@/app/api/admin/posts/[id]/amend/route";
import * as decisionRoute from "@/app/api/admin/posts/[id]/decision/route";
import * as resendRoute from "@/app/api/admin/posts/[id]/resend/route";
import { S, ToolDef, ToolError, pick } from "../types";

const toMs = (v: unknown): number => {
  const ms = typeof v === "number" ? v : Date.parse(String(v));
  if (!Number.isFinite(ms)) throw new ToolError("Give the time as an ISO date, e.g. 2026-11-23T18:00:00Z.");
  return ms;
};

// Making a new post needs its 1024x1024 picture, which only the browser draws today, so there is no
// create tool yet (see the PR). Everything else about posts is here.
export const postTools: ToolDef[] = [
  {
    name: "list_posts",
    title: "List posts",
    description:
      "The latest 200 posts: headline, Ro-State, status (draft, scheduled, pending approval, approved, denied), ad, creator and times. Making new posts isn't available to AI yet (their picture is drawn in the browser).",
    input: { status: S.str("Only posts with this status") },
    kind: "read",
    run: async (ctx, a) => {
      const data = await ctx.call(postsRoute.GET, { path: "/api/admin/posts" });
      let list = data.posts as Array<Record<string, unknown>>;
      if (a.status) list = list.filter((p) => p.status === a.status);
      return list.map((p) =>
        pick(p, ["id", "headline", "body", "roState", "status", "mediaType", "adId", "noAd", "organizationName", "creatorName", "scheduledAt", "createdAt", "decidedAt", "decidedByLabel", "denyReason", "imageUrl"])
      );
    },
  },
  {
    name: "get_post",
    title: "Read a post",
    description: "One post in full, including its Discord message links and edit notes.",
    input: { id: S.str("The post's id") },
    required: ["id"],
    kind: "read",
    run: (ctx, a) => ctx.call(postRoute.GET, { path: `/api/admin/posts/${a.id}`, params: { id: a.id } }),
  },
  {
    name: "get_post_options",
    title: "Ro-States and ads for posts",
    description: "The Ro-States (feeds) a post can go to and the ads that still have post impressions.",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(optionsRoute.GET, { path: "/api/admin/posts/options" }),
  },
  {
    name: "reschedule_post",
    title: "Move a scheduled post",
    description: "Moves a scheduled post to another time (it is then sent to Discord at that time).",
    input: { id: S.str("The post's id"), at: S.str("New time, ISO 8601 with a time zone, e.g. 2026-11-23T18:00:00Z") },
    required: ["id", "at"],
    kind: "write",
    refs: { id: "post" },
    openWorld: true,
    summary: (a) => `Move post ${a.id} to ${a.at}`,
    run: (ctx, a) =>
      ctx.call(scheduleRoute.POST, { method: "POST", path: `/api/admin/posts/${a.id}/schedule`, params: { id: a.id }, body: { scheduledAt: toMs(a.at) } }),
  },
  {
    name: "send_post_now",
    title: "Send a scheduled post now",
    description: "Sends a scheduled post to Discord (#ftn-plus and leadership) right away. Needs the person's approval on the site.",
    input: { id: S.str("The post's id") },
    required: ["id"],
    kind: "danger",
    refs: { id: "post" },
    openWorld: true,
    summary: (a) => `Send post ${a.id} to Discord now`,
    run: (ctx, a) => ctx.call(scheduleRoute.POST, { method: "POST", path: `/api/admin/posts/${a.id}/schedule`, params: { id: a.id }, body: { now: true } }),
  },
  {
    name: "publish_post_draft",
    title: "Publish a draft post",
    description: "Publishes a draft post: sends it to Discord now, or schedules it when `at` is given. Needs the person's approval on the site.",
    input: { id: S.str("The draft's id"), at: S.str("Optional time to schedule it for, ISO 8601") },
    required: ["id"],
    kind: "danger",
    refs: { id: "post" },
    openWorld: true,
    summary: (a) => (a.at ? `Schedule draft post ${a.id} for ${a.at}` : `Publish draft post ${a.id} to Discord now`),
    run: (ctx, a) =>
      ctx.call(postRoute.PATCH, { method: "PATCH", path: `/api/admin/posts/${a.id}`, params: { id: a.id }, body: { publish: true, scheduledAt: a.at ? toMs(a.at) : null } }),
  },
  {
    name: "amend_post",
    title: "Add an edit note to a post",
    description: "Adds an edit note to a sent post; its Discord messages are edited to show it. Needs the person's approval on the site.",
    input: { id: S.str("The post's id"), note: S.str("The correction, as readers will see it") },
    required: ["id", "note"],
    kind: "danger",
    refs: { id: "post" },
    openWorld: true,
    summary: (a) => `Add edit note to post ${a.id}: "${a.note}"`,
    run: (ctx, a) => ctx.call(amendRoute.POST, { method: "POST", path: `/api/admin/posts/${a.id}/amend`, params: { id: a.id }, body: { note: a.note } }),
  },
  {
    name: "decide_post",
    title: "Approve or deny a post",
    description:
      "Leadership decision on a pending post. approve publishes it to its Ro-State's Discord feed; deny needs a reason. Needs the person's approval on the site.",
    input: { id: S.str("The post's id"), decision: S.enum(["approve", "deny"], "approve or deny"), reason: S.str("Why it was denied (deny only)") },
    required: ["id", "decision"],
    kind: "danger",
    refs: { id: "post" },
    openWorld: true,
    summary: (a) => (a.decision === "approve" ? `Approve post ${a.id} (publishes to its Discord feed)` : `Deny post ${a.id}: ${a.reason || ""}`),
    run: (ctx, a) =>
      ctx.call(decisionRoute.POST, { method: "POST", path: `/api/admin/posts/${a.id}/decision`, params: { id: a.id }, body: pick(a, ["decision", "reason"]) }),
  },
  {
    name: "resend_post",
    title: "Resend a post to Discord",
    description: "Sends a post's Discord messages again (when one failed or was deleted). Needs the person's approval on the site.",
    input: { id: S.str("The post's id") },
    required: ["id"],
    kind: "danger",
    refs: { id: "post" },
    openWorld: true,
    summary: (a) => `Resend post ${a.id} to Discord`,
    run: (ctx, a) => ctx.call(resendRoute.POST, { method: "POST", path: `/api/admin/posts/${a.id}/resend`, params: { id: a.id } }),
  },
  {
    name: "delete_post",
    title: "Delete a post",
    description: "Deletes a post and removes its messages from Discord. Needs the person's approval on the site.",
    input: { id: S.str("The post's id") },
    required: ["id"],
    kind: "danger",
    refs: { id: "post" },
    openWorld: true,
    summary: (a) => `Delete post ${a.id} (also from Discord)`,
    run: (ctx, a) => ctx.call(postRoute.DELETE, { method: "DELETE", path: `/api/admin/posts/${a.id}`, params: { id: a.id } }),
  },
];
