"use client";
import React, { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
} from "lucide-react";

export default function EmergencyAuthPage() {
  const [accessKey, setAccessKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessKey.trim()) {
      setError("Please enter the access key.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey: accessKey.trim() }),
      });

      const data = (await res.json()) as any;

      if (res.ok && data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        setError(data.error || "Invalid access key.");
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 pt-24 pb-12">
      <Card className="max-w-md w-full p-8 border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white">OAuth Access</h1>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 text-center leading-relaxed">
            {error}
          </div>
        )}

        {/* Access Key Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              Access Key
            </label>
            <Input
              type="password"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="Enter access key..."
              required
              className="text-sm font-mono"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !accessKey.trim()}
            className="w-full bg-[#00a9d2] hover:bg-[#0090b3] text-white font-bold text-xs h-10 cursor-pointer shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Validating...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </form>

        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 text-center">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Return Home
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
