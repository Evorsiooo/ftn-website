import type { Metadata } from "next";
import { STATIC_CARDS } from "@/lib/og/cards";
import { shareMeta } from "@/lib/og/meta";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Tipline",
  description: "Have any information to share with us? This is the place.",
  ...shareMeta({ title: "Tipline | FTN News", description: "Have any information to share with us? This is the place.", siteName: "FTN News", image: STATIC_CARDS.tips }),
  alternates: { canonical: `${SITE_URL}/tips` },
};

export default function TipsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
