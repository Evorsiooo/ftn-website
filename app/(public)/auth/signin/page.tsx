"use client";
import { fetchSession } from "@/lib/session-client";
import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Lock,
  User,
  ArrowLeft,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  Loader2,
} from "lucide-react";

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if already signed in
  useEffect(() => {
    fetchSession()
      .then((data: any) => {
        if (data && data.authenticated) {
          router.replace(returnUrl);
        }
      })
      .catch(() => {});
  }, [router, returnUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Please provide both your username and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password,
        }),
      });

      const data = (await res.json()) as any;

      if (res.ok && data.success) {
        window.location.href = returnUrl;
      } else {
        setError(data.error || "Invalid username or password.");
      }
    } catch {
      setError("Network error while attempting to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 pt-24 pb-12">
      <Card className="max-w-md w-full p-8 border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white">Sign In</h1>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 flex items-start gap-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400 mt-0.5" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              Username
            </label>
            <div className="relative">
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                required
                autoComplete="username"
                className="pl-9 text-sm"
              />
              <User className="absolute left-3 top-3 h-4 w-4 text-neutral-400 dark:text-neutral-500" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              Password
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                autoComplete="current-password"
                className="pl-9 pr-10 text-sm"
              />
              <Lock className="absolute left-3 top-3 h-4 w-4 text-neutral-400 dark:text-neutral-500" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 cursor-pointer"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#00a9d2] hover:bg-[#0090b3] text-white font-bold text-xs h-10 cursor-pointer shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        {/* Footer info */}
        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 text-center">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Return to Home
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] flex items-center justify-center text-xs text-neutral-400">Loading...</div>}>
      <SignInContent />
    </Suspense>
  );
}
