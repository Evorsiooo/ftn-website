"use client";
import { AppShell } from "../_bc/shell";
import { LibraryPage } from "../_bc/pages";

export default function Page() {
  return (
    <AppShell active="library">
      <LibraryPage />
    </AppShell>
  );
}
