import Link from "next/link";

const PAGES: [string, string, string][] = [
  ["/plus-mockups/radio", "Radio player", "The glass pill with Listen / Stop and LIVE, Coming Up open"],
  ["/plus-mockups/radio/lyrics", "Full-screen lyrics", "Moving artwork mesh, am-lyrics, the show on air"],
  ["/plus-mockups/radio/coming-up", "Full-screen Coming Up", "The same player with the station's queue"],
  ["/plus-mockups/home", "Home", "Shelves: live now, coming up, videos, radio, sports"],
  ["/plus-mockups/library", "Library", "Every video, filtered"],
  ["/plus-mockups/sports", "Sports", "Next events, results, table, leagues"],
  ["/plus-mockups/schedule", "Schedule", "Today's line-up with what is on air"],
  ["/plus-mockups/watch", "Video player", "BitChord's theater mode for video"],
  ["/plus-mockups/studio", "Studio", "Broadcaster controls, callers and the waiting room"],
  ["/plus-mockups/waiting-room", "Caller waiting room", "What a caller sees before going on air"],
];

export default function Index() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[640px] px-6 py-12">
        <h1 className="type-header-emphasized">FTN+ in BitChord’s styling</h1>
        <p className="mt-2 type-body-tall text-secondary">Mockups for review. Nothing here is live data.</p>
        <ul className="mt-6 overflow-hidden rounded-[10px] bg-quinary">
          {PAGES.map(([href, title, detail]) => (
            <li key={href} className="relative hairline-[16px]">
              <Link href={href} className="flex flex-col gap-0.5 px-4 py-[11px] hover:bg-quaternary">
                <span className="type-title-3">{title}</span>
                <span className="type-callout text-secondary">{detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
