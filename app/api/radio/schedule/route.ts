import { NextResponse } from "next/server";

export const runtime = "edge";

const WEEKLY_SCHEDULE = [
  { day: "Monday", time: "08:00 - 10:00", show: "Morning District Briefing", presenter: "Elena Vance" },
  { day: "Monday", time: "18:00 - 20:00", show: "Drive Time Melodies", presenter: "Marcus Lee" },
  { day: "Wednesday", time: "20:00 - 22:00", show: "The State of Roblox Politics Live", presenter: "Broadcast Panel" },
  { day: "Friday", time: "21:00 - 01:00", show: "Friday Night Pulse DJ Mix", presenter: "DJ Nova" },
  { day: "Saturday", time: "14:00 - 17:00", show: "Sports Grandstand Live Telemetry", presenter: "Sports Division" },
];

export async function GET() {
  return NextResponse.json({ schedule: WEEKLY_SCHEDULE });
}
