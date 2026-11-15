import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Videos | FTN+" },
  description: "Every video and stream from FTN's channels.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
