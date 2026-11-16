import type { Metadata } from "next";
import { STATIC_CARDS } from "@/lib/og/cards";
import { shareMeta } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: { absolute: "Saved | FTN+" },
  description: "Videos you saved, and where you left off.",
  ...shareMeta({ title: "Saved | FTN+", description: "Videos you saved, and where you left off.", siteName: "FTN+", image: STATIC_CARDS.plus }),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
