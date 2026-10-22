import Link from "next/link";
import { plusHref, watchPath } from "@/lib/plus-links";
import { FtnPlusLogo } from "./ftn-plus-logo";
import { panelClass } from "./promo-parts";

export interface PlusPick {
  youtubeId: string;
  title: string;
  thumbnailUrl: string;
  channelTitle: string;
  durationSeconds: number | null;
}

function duration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** "Picked from FTN+": a single row of recent videos between the article rows. */
export function PlusPicks({ picks }: { picks: PlusPick[] }) {
  if (picks.length === 0) return null;
  return (
    <section aria-label="Picked from FTN+" className={`${panelClass} p-4 sm:p-5`}>
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
          Picked from <FtnPlusLogo className="h-5" />
        </div>
        <Link href={plusHref("/plus", "picks")} className="text-xs font-semibold text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white">
          Browse the library →
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {picks.map((v) => (
          <Link
            key={v.youtubeId}
            href={plusHref(watchPath(v.youtubeId), "picks")}
            className="group overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 transition hover:border-[#FFBB14] dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="relative aspect-video bg-neutral-200 dark:bg-neutral-800">
              <img src={v.thumbnailUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              {duration(v.durationSeconds) && (
                <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                  {duration(v.durationSeconds)}
                </span>
              )}
            </div>
            <div className="p-3">
              <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-neutral-900 dark:text-white">{v.title}</h3>
              <p className="mt-0.5 text-[11px] text-neutral-500">{v.channelTitle}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
