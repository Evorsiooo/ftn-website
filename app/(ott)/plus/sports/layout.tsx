import type { Metadata } from "next";
import { STATIC_CARDS } from "@/lib/og/cards";
import { shareMeta } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: { absolute: "Sports | FTN+" },
  description: "Fixtures, results and standings for FTN Sports leagues and series.",
  ...shareMeta({ title: "Sports | FTN+", description: "Fixtures, results and standings for FTN Sports leagues and series.", siteName: "FTN+", image: STATIC_CARDS.sports }),
};

export default function SportsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
