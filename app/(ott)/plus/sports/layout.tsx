import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "Sports | FTN+",
  },
  description: "Fixtures, results and standings for FTN Sports leagues and series.",
};

export default function SportsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
