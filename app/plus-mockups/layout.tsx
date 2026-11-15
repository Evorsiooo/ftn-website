import type { Metadata, Viewport } from "next";
import "./_ui/plus.css";
import { MockShell } from "./_ui/shell";

// Mockups of FTN+ in its own style, for review only: not linked from the site and not indexed.
export const metadata: Metadata = {
  title: { absolute: "FTN+ mockups" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#16110a", colorScheme: "dark" };

export default function MockupsLayout({ children }: { children: React.ReactNode }) {
  return <MockShell>{children}</MockShell>;
}
