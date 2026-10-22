import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "Library | FTN+",
  },
  description: "Livestreams, replays and originals from every FTN channel.",
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
