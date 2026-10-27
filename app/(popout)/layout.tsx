import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
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
