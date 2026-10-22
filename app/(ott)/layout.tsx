import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import OTTClientLayout from "./client-layout";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

export const runtime = "edge";

export const viewport: Viewport = {
  themeColor: "#FFBB14",
};

export const metadata: Metadata = {
  title: {
    absolute: "FTN+",
  },
  description: "Stream Roblox livestreams, broadcasts, podcasts, and video on-demand on FTN+.",
  icons: {
    icon: "/logos/ftnplus_favicon.png",
    shortcut: "/logos/ftnplus_favicon.png",
    apple: "/logos/ftnplus_favicon.png",
  },
  openGraph: {
    title: "FTN+",
    description: "Stream Roblox livestreams, broadcasts, podcasts, and video on-demand on FTN+.",
    type: "website",
    siteName: "FTN+",
  },
  twitter: {
    card: "summary",
    title: "FTN+",
    description: "Stream Roblox livestreams, broadcasts, podcasts, and video on-demand on FTN+.",
  },
  other: {
    "theme-color": "#FFBB14",
  },
};

export default function OTTLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${bricolage.variable} contents`}>
      <OTTClientLayout>{children}</OTTClientLayout>
    </div>
  );
}
