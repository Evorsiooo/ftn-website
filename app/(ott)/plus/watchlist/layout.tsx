import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "Saved | FTN+",
  },
  description: "Your saved FTN+ broadcasts, episodes, and live streams.",
};

export default function WatchlistLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
