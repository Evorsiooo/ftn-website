import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "Webradio | FTN+",
  },
  description: "Listen live to FTN Radio, see the show schedule and take the bot to your Discord.",
};

export default function RadioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
