import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Articles",
  description: "The #1 Roblox Ro-State news source, covering politics, sports, crime, and more.",
  openGraph: {
    title: "Articles | FTN News",
    description: "The #1 Roblox Ro-State news source, covering politics, sports, crime, and more.",
    type: "website",
    siteName: "FTN News",
  },
  twitter: {
    card: "summary",
    title: "Articles | FTN News",
    description: "The #1 Roblox Ro-State news source, covering politics, sports, crime, and more.",
  },
  other: {
    "theme-color": "#e2162b",
  },
};

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
