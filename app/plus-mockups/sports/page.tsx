"use client";
import { AppShell } from "../_bc/shell";
import { SportsPage } from "../_bc/pages";

export default function Page() {
  return (
    <AppShell active="sports">
      <SportsPage />
    </AppShell>
  );
}
