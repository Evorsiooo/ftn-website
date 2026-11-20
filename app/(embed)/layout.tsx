import type { Metadata } from "next";

export const runtime = "edge";

export const metadata: Metadata = {
  title: { absolute: "FTN Radio" },
  icons: { icon: "/logos/ftnplus_favicon.png" },
  robots: { index: false },
};

/** Pages other websites show in an iframe (see next.config.ts: only /embed/* may be framed). */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
