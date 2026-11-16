import type { Metadata } from "next";
import { STATIC_CARDS } from "@/lib/og/cards";
import { shareMeta } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: "Articles",
  description: "Every story from the FTN newsroom.",
  ...shareMeta({ title: "Articles | FTN News", description: "Every story from the FTN newsroom.", siteName: "FTN News", image: STATIC_CARDS.articles }),
};

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
