import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const runtime = "edge";

export default function AuthDisabledPage() {
  return (
    <div className="min-h-[70vh] w-full bg-neutral-50 text-neutral-900 dark:bg-black dark:text-white flex flex-col items-center justify-center p-6 space-y-6">
      <div className="text-center space-y-4 max-w-sm">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
          Sign in currently disabled
        </h1>

        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          Account creation and new user registrations are temporarily suspended.
        </p>

        <div className="pt-2">
          <Link href="/">
            <Button className="w-full bg-[#00a9d2] hover:bg-[#0090b3] text-white font-bold text-xs h-11 cursor-pointer shadow-sm">
              Return to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
