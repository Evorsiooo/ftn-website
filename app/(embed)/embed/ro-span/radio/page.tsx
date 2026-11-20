"use client";
export const runtime = "edge";
import { RoSpanRadio } from "@/components/embed/ro-span/radio";

/**
 * RO-SPAN's webradio player (ro-span.org's sidebar shows it in an iframe). Each partner site gets
 * its own embed under /embed/<site>/, made to match that site. It plays the same radio as FTN+,
 * with the same engine, so it's in sync with every other listener.
 */
export default function RoSpanRadioEmbed() {
  return <RoSpanRadio />;
}
