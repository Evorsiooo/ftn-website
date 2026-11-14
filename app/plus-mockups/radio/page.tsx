"use client";
import { AppShell } from "../_bc/shell";
import { RadioPage } from "../_bc/pages";

/** The radio: the glass pill with Coming Up open beside the station page. */
export default function Page() {
  return (
    <AppShell active="radio" panel="up-next">
      <RadioPage />
    </AppShell>
  );
}
