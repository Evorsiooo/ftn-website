import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "Radio | FTN+",
  },
  description: "FTN Radio, around the clock.",
};

export default function RadioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
