"use client";
import { AppShell } from "../_bc/shell";
import { StudioPage } from "../_bc/studio";

export default function Page() {
  return (
    <AppShell active="studio">
      <StudioPage />
    </AppShell>
  );
}
