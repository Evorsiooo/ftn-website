import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Saved | FTN+" },
  description: "Videos you saved, and where you left off.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
