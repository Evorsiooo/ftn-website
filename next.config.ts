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
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
