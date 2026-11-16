import type { Metadata } from "next";
import { getDb } from "@/db";
import { STATIC_CARDS, existingCardUrl, leagueCard } from "@/lib/og/cards";
import { shareMeta } from "@/lib/og/meta";
import { leagueBySlug } from "@/lib/og/sources";

export const runtime = "edge";

// The league page is a client component, so its title and link preview come from here.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const d1 = (process.env as any).DB as D1Database;
    const league = d1 ? await leagueBySlug(getDb(d1), slug) : null;
    if (league) {
      const title = `${league.name} | FTN+`;
      const description = `Races, standings and teams for the ${league.name} ${league.season} season.`.replace(
        "Races,",
        league.kind === "team" ? "Matches," : "Races,"
      );
      const image = (await existingCardUrl(leagueCard(league))) || STATIC_CARDS.sports;
      return { title: { absolute: title }, description, ...shareMeta({ title, description, siteName: "FTN+", image }) };
    }
  } catch {}
  return {};
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
