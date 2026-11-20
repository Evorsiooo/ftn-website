"use client";
export const runtime = "edge";
import { EmbedPlayer } from "@/components/embed/radio-embed";

/**
 * The webradio player other sites put in their sidebar with an iframe (RO-SPAN first).
 * It plays the same radio as FTN+, with the same engine, so it's in sync with every other listener.
 */
export default function RadioEmbed() {
  return <EmbedPlayer />;
}
