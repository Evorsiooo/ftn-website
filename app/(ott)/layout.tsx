import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import OTTClientLayout from "./client-layout";
import "@/components/plus/plus.css";

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
