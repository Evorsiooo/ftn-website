"use client";
import { AppShell } from "../_bc/shell";
import { SchedulePage } from "../_bc/pages";

export default function Page() {
  return (
    <AppShell active="schedule">
      <SchedulePage />
    </AppShell>
  );
}
