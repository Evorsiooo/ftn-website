import type { Metadata } from "next";

export const runtime = "edge";

export const metadata: Metadata = {
  title: { absolute: "FTN Radio" },
  icons: { icon: "/logos/ftnplus_favicon.png" },
  robots: { index: false },
};

/**
 * Pages other websites show in an iframe, one folder per site (/embed/<site>/...), each made to match
 * that site. See next.config.ts: only /embed/* may be framed.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
