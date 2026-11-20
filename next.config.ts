import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// The radio engine's entry file (public/radio-engine/site.js) keeps the same name on every build, and
// static files are cached for hours, so browsers kept an old engine after a deploy. The page loads it
// as site.js?v=<hash of the file>: a new engine is a new URL.
const radioEngineVersion = (() => {
  try {
    return createHash("sha256").update(readFileSync("public/radio-engine/site.js")).digest("hex").slice(0, 12);
  } catch {
    return String(Date.now());
  }
})();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone=(self): the Studio and calling in on the radio page. Site-wide, because the policy is
  // the one of the page the visit started on, and both are reached by in-app navigation. The
  // browser still asks the person before any page gets the microphone. Other sites' frames never do.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  env: { RADIO_ENGINE_VERSION: radioEngineVersion },
  // FTN+'s old page names (renamed in the 2026 redesign)
  async redirects() {
    return [
      { source: "/plus/library", destination: "/plus/videos", permanent: true },
      { source: "/plus/watchlist", destination: "/plus/saved", permanent: true },
      // the admin Schedule and Studio moved (2026-11): the Schedule is the hub, the Studio opens for a show
      { source: "/admin/radio", destination: "/admin/schedule", permanent: true },
      { source: "/admin/radio/studio", destination: "/admin/schedule/studio", permanent: true },
      { source: "/admin/radio/ratings", destination: "/admin/radio/library?tab=ratings", permanent: true },
      // admin redesign (2026-11): roles, accounts and mutes are one People page; FTN+ content left Settings
      { source: "/admin/roles", destination: "/admin/people", permanent: false },
      { source: "/admin/settings/moderation", destination: "/admin/people?tab=muted", permanent: false },
      { source: "/admin/settings/plus", destination: "/admin/plus", permanent: false },
    ];
  },
  async headers() {
    return [
      // Everything but /embed/* refuses to be shown in another site's frame.
      { source: "/((?!embed/).*)", headers: securityHeaders },
      // /embed/* is made for other sites' iframes (the radio player in partners' sidebars).
      {
        source: "/embed/:path*",
        headers: [
          ...securityHeaders.filter((h) => h.key !== "X-Frame-Options"),
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "tr.rbxcdn.com" },
    ],
  },
};

export default nextConfig;
