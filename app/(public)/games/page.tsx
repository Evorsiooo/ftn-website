"use client";
export const runtime = "edge";
import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function GamesHubPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 sm:px-8 py-32 text-center space-y-6 text-neutral-900 dark:text-white">
      <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-neutral-900 dark:text-white">
        We&apos;re still building!
      </h1>

      <div className="pt-2">
        <Link href="/">
          <Button variant="outline" size="sm" className="gap-2 text-xs border-neutral-300 text-neutral-800 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-200 dark:hover:text-white cursor-pointer">
            <ArrowLeft className="h-3.5 w-3.5" /> Return to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
