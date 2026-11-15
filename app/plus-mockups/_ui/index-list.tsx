"use client";
import Link from "next/link";

const M = "/plus-mockups";
const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Videos", items: [["/home", "Home"], ["/home/live", "Home, with a live stream"], ["/videos", "Videos"], ["/videos/live", "Videos, with a live stream pinned"], ["/watch/zcmpUBqBSl0", "Watch"], ["/saved", "Saved"], ["/saved/empty", "Saved, empty"]] },
  { title: "Radio", items: [["/radio", "Radio, AutoDJ"], ["/radio/show", "Radio, automated show"], ["/radio/hosted", "Radio, hosted show with calls"], ["/radio/off-air", "Radio, off air"], ["/radio/call", "Call-in link, signed out"], ["/radio/hosted#mic", "Calling in: microphone check"], ["/radio/hosted#waiting", "Calling in: waiting"], ["/radio/hosted#onair", "Calling in: on air"], ["/radio/call-closed", "Call-in link after calls closed"], ["/radio#full", "Full screen with lyrics"], ["/radio/hosted#full", "Full screen without lyrics"], ["/site", "The player bar on the FTN website"]] },
  { title: "Schedule and Sports", items: [["/schedule", "Schedule"], ["/sports", "Sports"], ["/sports/harrison-grand-touring-championship", "A league"]] },
];
const POPOUTS: [string, number, number][] = [["Tiny", 160, 96], ["Small", 320, 120], ["Tall", 380, 640]];

export function IndexList() {
  return (
    <main className="page" style={{ maxWidth: 720, paddingTop: 64 }}>
      <h1 className="h1">FTN+ mockups</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        For review. The videos, channels, shows and leagues are real FTN+ content. The songs, lyrics, the Night Drive and Sunday Drive shows, and video durations are made up. Nothing plays and nothing is saved.
      </p>
      {GROUPS.map((g) => (
        <section key={g.title} style={{ marginTop: 32 }}>
          <h2 className="h2" style={{ marginBottom: 8 }}>{g.title}</h2>
          {g.items.map(([href, label]) => (
            <div key={href}>
              <Link href={M + href} style={{ display: "inline-block", padding: "6px 0", fontWeight: 600 }}>{label}</Link>
            </div>
          ))}
        </section>
      ))}
      <section style={{ marginTop: 32 }}>
        <h2 className="h2" style={{ marginBottom: 12 }}>Popout window</h2>
        <div className="acts">
          {POPOUTS.map(([label, w, h]) => (
            <button key={label} className="btn sec sm" onClick={() => window.open(`${M}/popout`, `ftnplus-${label}`, `width=${w},height=${h}`)}>
              {label}, {w} × {h}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
