"use client";
import { AppShell } from "../../_bc/shell";
import { RadioPage } from "../../_bc/pages";

/** The full-screen player with Coming Up in the right-hand column. */
export default function Page() {
  return (
    <AppShell active="radio" fullScreen fullScreenPanel="queue">
      <RadioPage />
    </AppShell>
  );
}
