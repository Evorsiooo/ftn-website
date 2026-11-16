import type { Metadata } from "next";
import { STATIC_CARDS } from "@/lib/og/cards";
import { shareMeta } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: {
    absolute: "Radio | FTN+",
  },
  description: "FTN Radio, around the clock.",
  ...shareMeta({ title: "Radio | FTN+", description: "FTN Radio, around the clock.", siteName: "FTN+", image: STATIC_CARDS.radio }),
};

export default function RadioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
