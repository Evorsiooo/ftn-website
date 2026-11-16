import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import OTTClientLayout from "./client-layout";
import { STATIC_CARDS } from "@/lib/og/cards";
import { shareMeta } from "@/lib/og/meta";

const manrope = localFont({
  src: "../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  variable: "--font-manrope",
  weight: "100 900",
  display: "swap",
});

export const runtime = "edge";

// FTN+ is dark only.
export const viewport: Viewport = {
  themeColor: "#16110a",
  colorScheme: "dark",
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
  ...shareMeta({
    title: "FTN+",
    description: "Videos, livestreams, radio and sports from FTN, on demand and as it happens.",
    siteName: "FTN+",
    image: STATIC_CARDS.plus,
  }),
  // Discord colours the stripe beside a link preview with theme-color: FTN yellow, like the FTN News pages.
  other: { "theme-color": "#ffbb14" },
};

export default function OTTLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${manrope.variable} contents`}>
      <OTTClientLayout>{children}</OTTClientLayout>
    </div>
  );
}
