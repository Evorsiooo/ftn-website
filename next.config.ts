import type { NextConfig } from "next";

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
