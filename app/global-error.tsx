"use client";

import { MaintenanceBanner } from "@/components/maintenance-banner";

// Shown when a page fails outright (e.g. the database is unreachable), so the banner still shows.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#07080b", color: "#f5f6f8", fontFamily: "system-ui, sans-serif" }}>
        <MaintenanceBanner />
        <main style={{ padding: "48px 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>This page can&apos;t load right now.</h1>
          <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: 0, background: "#ffbb14", color: "#041e41", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
