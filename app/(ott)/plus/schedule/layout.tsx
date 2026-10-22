import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "Schedule | FTN+",
  },
  description: "Everything coming up on FTN Radio and the FTN+ livestreams.",
};

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
