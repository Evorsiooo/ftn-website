import { NextRequest, NextResponse } from "next/server";
import type { RadioTimeline } from "@/lib/radio/autodj";
import { recordMixReport } from "@/lib/radio/mix-reports";
import { AUTODJ_KEY, noStore, radioBucket } from "@/lib/radio/store";

export const runtime = "edge";

const STYLES = ["loop", "blend", "filter", "crossfade"];
const str = (x: unknown, max: number) => typeof x === "string" && x.length > 0 && x.length <= max;

/**
 * A listener's browser planned a mix that the safety checks refused (lib/radio/mix-reports.ts). Only taken for
 * the mix out of the last song of the stored running order, the one browsers are planning right now, so it
 * can't be used to fill the log with made-up songs. No database use.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 2000) return NextResponse.json({ error: "too big" }, { status: 413, headers: noStore });
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "not JSON" }, { status: 400, headers: noStore });
  }
  if (!str(r.from, 300) || !str(r.to, 300) || !str(r.problem, 200) || !STYLES.includes(r.style as string)) {
    return NextResponse.json({ error: "bad report" }, { status: 400, headers: noStore });
  }
  const stored = await radioBucket()?.get(AUTODJ_KEY);
  const tl = stored ? ((await stored.json().catch(() => null)) as RadioTimeline | null) : null;
  if (tl?.items[tl.items.length - 1]?.key !== r.from) return NextResponse.json({ ok: false }, { headers: noStore });
  await recordMixReport({ from: r.from as string, to: r.to as string, style: r.style as string, problem: r.problem as string, where: "browser" });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
