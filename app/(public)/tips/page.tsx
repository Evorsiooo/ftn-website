"use client";
export const runtime = "edge";
import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, UserCheck, ShieldAlert, AlertTriangle, Lock, LogIn } from "lucide-react";

export default function TiplinePage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [shareUsername, setShareUsername] = useState(false);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [muteDetails, setMuteDetails] = useState<any | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [tiplineAccess, setTiplineAccess] = useState<"public" | "members_only">("public");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/session")
        .then((res) => res.json())
        .then((data: any) => {
          if (data && data.user) {
            setCurrentUser(data.user);
            setIsMuted(Boolean(data.isMuted));
            setMuteDetails(data.muteDetails || null);
          }
        })
        .catch(() => {}),
      fetch("/api/tips")
        .then((res) => res.json())
        .then((data: any) => {
          if (data?.tiplineAccess) {
            setTiplineAccess(data.tiplineAccess);
          }
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMuted) return;
    if (tiplineAccess === "members_only" && !currentUser) {
      alert("You must be logged in to submit a tip.");
      return;
    }
    if (!subject.trim() || !message.trim()) return;

    try {
      const res = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, shareUsername }),
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        setSubmitted(true);
        setSubject("");
        setMessage("");
        setShareUsername(false);
      } else {
        alert(data.error || "Submission failed");
      }
    } catch {
      alert("Submission error. Please try again.");
    }
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 sm:px-6 pt-24 sm:pt-28 pb-16 text-neutral-900 dark:text-white">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-neutral-900 dark:text-white">
          Anonymous Tipline
        </h1>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
          Confidential investigative leads submitted directly to the FTN newsroom.
        </p>
      </div>

      {submitted ? (
        <Card className="p-8 text-center space-y-4 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Tip Submitted</h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
            Thank you for your report. Our newsroom has received your submission.
          </p>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSubmitted(false)}
              className="mt-2 text-xs border-neutral-300 text-neutral-800 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-200 dark:hover:text-white cursor-pointer"
            >
              Submit Another Tip
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-6 sm:p-8 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
          {isMuted ? (
            <div className="p-6 rounded-xl border border-red-200 bg-red-50 text-red-900 dark:border-red-800/80 dark:bg-red-950/30 dark:text-red-200 text-center space-y-3">
              <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400 mx-auto" />
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Tipline Access Suspended</h2>
              <p className="text-xs text-red-700 dark:text-red-200 max-w-md mx-auto leading-relaxed">
                Your account is currently moderated from submitting tipline leads{" "}
                {muteDetails?.expiresAt ? `until ${new Date(muteDetails.expiresAt).toLocaleDateString()}` : "indefinitely"}.
              </p>
              {muteDetails?.reason && (
                <div className="text-[11px] font-mono text-neutral-600 dark:text-neutral-400">
                  Reason: {muteDetails.reason}
                </div>
              )}
            </div>
          ) : !loading && tiplineAccess === "members_only" && !currentUser ? (
            <div className="p-8 rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40 text-center space-y-4 shadow-sm dark:shadow-none">
              <div className="h-12 w-12 rounded-full bg-cyan-100 border border-cyan-300 dark:bg-cyan-950/80 dark:border-cyan-800/60 flex items-center justify-center mx-auto text-[#00a9d2]">
                <Lock className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Authentication Required</h2>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 max-w-md mx-auto leading-relaxed">
                  The investigative tipline is currently restricted to registered users. Please sign in with your Roblox account to submit a confidential lead.
                </p>
              </div>
              <div className="pt-2">
                <a href="/api/auth/roblox">
                  <Button className="font-bold text-xs bg-[#00a9d2] hover:bg-[#0090b3] text-white px-6 gap-2 cursor-pointer shadow-sm">
                    <LogIn className="h-4 w-4" /> Sign In to Submit Tip
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-400 mb-1.5">
                  Subject
                </label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Topic or incident summary"
                  required
                  maxLength={200}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-400 mb-1.5">
                  Details
                </label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Provide dates, locations, and details..."
                  rows={6}
                  required
                  maxLength={5000}
                />
              </div>

              {/* Username Sharing Option */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50 p-4 text-xs">
                {currentUser ? (
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={shareUsername}
                      onChange={(e) => setShareUsername(e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[#00a9d2] focus:ring-[#00a9d2] cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <div className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-neutral-600 dark:text-neutral-300" /> Share username with newsroom
                      </div>
                      <div className="text-neutral-600 dark:text-neutral-400 text-[11px]">
                        Share as <strong>@{currentUser.robloxUsername}</strong> so reporters can follow up with you.
                      </div>
                    </div>
                  </label>
                ) : (
                  <div className="flex items-center justify-between gap-4 text-neutral-600 dark:text-neutral-400">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-[#00a9d2] shrink-0" />
                      <span>Submitting 100% anonymously. Sign in with Roblox if you want to share your username.</span>
                    </div>
                    <a href="/api/auth/roblox">
                      <Button variant="outline" size="sm" type="button" className="text-xs h-7 border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-white cursor-pointer">
                        Sign In
                      </Button>
                    </a>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full font-bold h-11 text-xs uppercase tracking-wider flex items-center justify-center bg-neutral-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-neutral-200 cursor-pointer shadow-sm"
              >
                Submit Tip
              </Button>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
