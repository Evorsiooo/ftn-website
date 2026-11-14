"use client";
import { AppShell } from "../_bc/shell";
import { HomePage } from "../_bc/pages";

export default function Page() {
  return (
    <AppShell active="home">
      <HomePage />
    </AppShell>
  );
}
