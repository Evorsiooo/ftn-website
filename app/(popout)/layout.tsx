import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

const manrope = localFont({
  src: "../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  variable: "--font-manrope",
  weight: "100 900",
  display: "swap",
});

export const runtime = "edge";

export const viewport: Viewport = { themeColor: "#07080b" };

export const metadata: Metadata = {
  title: { absolute: "FTN Radio" },
  icons: { icon: "/logos/ftnplus_favicon.png" },
  robots: { index: false },
};

export default function PopoutLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${manrope.variable} contents`}>{children}</div>;
}
