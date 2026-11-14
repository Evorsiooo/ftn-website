"use client";
import { AppShell } from "../../_bc/shell";
import { RadioPage } from "../../_bc/pages";

/** The full-screen player with the lyrics column. */
export default function Page() {
  return (
    <AppShell active="radio" fullScreen fullScreenPanel="lyrics">
      <RadioPage />
    </AppShell>
  );
}
