import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

export const runtime = "edge";

export const viewport: Viewport = { themeColor: "#0b0a09" };

export const metadata: Metadata = {
  title: { absolute: "FTN Radio" },
  icons: { icon: "/logos/ftnplus_favicon.png" },
  robots: { index: false },
};

export default function PopoutLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${bricolage.variable} contents`}>{children}</div>;
}
