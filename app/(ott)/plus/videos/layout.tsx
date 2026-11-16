import type { Metadata } from "next";
import { STATIC_CARDS } from "@/lib/og/cards";
import { shareMeta } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: { absolute: "Videos | FTN+" },
  description: "Every video and stream from FTN's channels.",
  ...shareMeta({ title: "Videos | FTN+", description: "Every video and stream from FTN's channels.", siteName: "FTN+", image: STATIC_CARDS.videos }),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
