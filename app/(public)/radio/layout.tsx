import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Webradio",
  description: "Listen to the latest hits, and regularly scheduled talk-shows, and more.",
  openGraph: {
    title: "Webradio | FTN News",
    description: "Listen to the latest hits, and regularly scheduled talk-shows, and more.",
    type: "website",
    siteName: "FTN News",
  },
  twitter: {
    card: "summary",
    title: "Webradio | FTN News",
    description: "Listen to the latest hits, and regularly scheduled talk-shows, and more.",
  },
  other: {
    "theme-color": "#e2162b",
  },
};

export default function RadioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
