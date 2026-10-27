export const runtime = "edge";
import React from "react";
import Link from "next/link";
import { GsPageHeader } from "@/components/gs/page-header";

export default function GamesHubPage() {
  return (
    <div>
      <GsPageHeader title="We're still building!">
        <Link href="/" className="inline-flex h-12 items-center rounded-full bg-[#16110a] px-7 text-sm font-bold text-[#fff8e6] transition hover:bg-black">
          Return to home
        </Link>
      </GsPageHeader>
    </div>
  );
}
