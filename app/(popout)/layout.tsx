import type { Metadata, Viewport } from "next";

export const runtime = "edge";

export const viewport: Viewport = { themeColor: "#16110a" };

export const metadata: Metadata = {
  title: { absolute: "FTN Radio" },
  icons: { icon: "/logos/ftnplus_favicon.png" },
  robots: { index: false },
};

export default function PopoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
