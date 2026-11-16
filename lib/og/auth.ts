import type { NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";

// The link preview workflow on GitHub uses the same secret as the other scheduled workflows.
export function isCronRequest(request: NextRequest): boolean {
  const accepted = [process.env.SCHEDULE_CRON_SECRET, process.env.RADIO_CRON_SECRET].filter(Boolean) as string[];
  const provided = request.headers.get("x-cron-secret");
  return !!provided && accepted.some((secret) => safeEqual(provided, secret));
}
