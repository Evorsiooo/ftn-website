import { NextResponse } from "next/server";
import { getLiveStreamStatus } from "@/lib/radio";

export const runtime = "edge";

export async function GET() {
  const status = await getLiveStreamStatus();
  return NextResponse.json({ status });
}
