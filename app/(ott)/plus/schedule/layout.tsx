import type { Metadata } from "next";
import { STATIC_CARDS } from "@/lib/og/cards";
import { shareMeta } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: { absolute: "Schedule | FTN+" },
  description: "Everything coming up on FTN Radio and the FTN+ livestreams.",
  ...shareMeta({ title: "Schedule | FTN+", description: "Everything coming up on FTN Radio and the FTN+ livestreams.", siteName: "FTN+", image: STATIC_CARDS.schedule }),
};

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
