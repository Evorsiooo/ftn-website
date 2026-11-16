import type { Metadata } from "next";
import { getDb } from "@/db";
import { RadioPage } from "@/components/plus/radio-ui";
import { STATIC_CARDS, existingCardUrl, showCard } from "@/lib/og/cards";
import { shareMeta } from "@/lib/og/meta";
import { currentRadioShow } from "@/lib/og/sources";

export const runtime = "edge";

const DESCRIPTION = "FTN Radio, around the clock.";

// The link preview names the show on air when the link is posted, with its time slot in UTC (true even
// after the show ends). The host's call-in link (?call=1) gets the call-in card.
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const call = (await searchParams).call === "1";
  try {
    const d1 = (process.env as any).DB as D1Database;
    const show = d1 ? await currentRadioShow(getDb(d1)) : null;
    if (show) {
      const card = showCard(show, call);
      const image = (await existingCardUrl(card)) || STATIC_CARDS.radio;
      const title = call ? `Call in to ${show.title} | FTN Radio` : `${show.title} | FTN Radio`;
      const slot = card.data.meta.replace(/^FTN Radio · /, "");
      const description = `${call ? "Call in to " : ""}${show.title} on FTN Radio, ${slot}.`;
      return { title: { absolute: title }, description, ...shareMeta({ title, description, siteName: "FTN+", image }) };
    }
  } catch {}
  return {
    title: { absolute: "Radio | FTN+" },
    description: DESCRIPTION,
    ...shareMeta({ title: "Radio | FTN+", description: DESCRIPTION, siteName: "FTN+", image: STATIC_CARDS.radio }),
  };
}

export default function Page() {
  return <RadioPage />;
}
