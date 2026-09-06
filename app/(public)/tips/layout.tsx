import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tipline",
  description: "Have any information to share with us? This is the place.",
  openGraph: {
    title: "Tipline | FTN News",
    description: "Have any information to share with us? This is the place.",
    type: "website",
    siteName: "FTN News",
  },
  twitter: {
    card: "summary",
    title: "Tipline | FTN News",
    description: "Have any information to share with us? This is the place.",
  },
  other: {
    "theme-color": "#e2162b",
  },
};

export default function TipsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
