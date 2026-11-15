"use client";
export const runtime = "edge";
import { use } from "react";
import { ReplayPage } from "@/components/plus/replays";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ReplayPage id={id} />;
}
