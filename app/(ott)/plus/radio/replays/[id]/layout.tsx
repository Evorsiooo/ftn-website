import type { Metadata } from "next";
import { getDb } from "@/db";
import { STATIC_CARDS, existingCardUrl } from "@/lib/og/cards";
import { shareMeta } from "@/lib/og/meta";
import { replayById } from "@/lib/og/sources";

export const runtime = "edge";

// The replay page is a client component, so its title and link preview come from here.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const d1 = (process.env as any).DB as D1Database;
    const replay = d1 ? await replayById(getDb(d1), id) : null;
    if (replay) {
      const title = `${replay.title} | FTN Radio`;
      const description = replay.card ? `${replay.card.data.meta}.` : "Listen back to this show on FTN+.";
      const image = (await existingCardUrl(replay.card)) || STATIC_CARDS.radio;
      return { title: { absolute: title }, description, ...shareMeta({ title, description, siteName: "FTN+", image }) };
    }
  } catch {}
  return {};
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
