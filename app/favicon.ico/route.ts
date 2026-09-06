import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/logos/ftn_favicon_transparent.png", request.url));
}
