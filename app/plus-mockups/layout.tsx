import type { Metadata, Viewport } from "next";
import "./_bc/global.css";

// Mockups of FTN+ in BitChord's styling, for review only: not linked from the site and not indexed.
export const metadata: Metadata = {
  title: { absolute: "FTN+ mockups" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1f1f1f" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function MockupsLayout({ children }: { children: React.ReactNode }) {
  // Covers the site's own body styles; BitChord's tokens and type take over from here.
  return (
    <div className="fixed inset-0 z-[1] overflow-hidden bg-page text-primary [font:var(--body)] antialiased">{children}</div>
  );
}
