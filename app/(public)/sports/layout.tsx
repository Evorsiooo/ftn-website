import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sports",
  description: "Live Roblox sports leagues, match fixtures, team statistics, and standings.",
  openGraph: {
    title: "Sports | FTN News",
    description: "Live Roblox sports leagues, match fixtures, team statistics, and standings.",
    type: "website",
    siteName: "FTN News",
  },
  twitter: {
    card: "summary",
    title: "Sports | FTN News",
    description: "Live Roblox sports leagues, match fixtures, team statistics, and standings.",
  },
  other: {
    "theme-color": "#e2162b",
  },
};

export default function SportsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
