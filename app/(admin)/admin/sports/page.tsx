"use client";
import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import Link from "next/link";
import { ArrowLeft, Trophy, Trash2, Loader2 } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { canManageSports } from "@/lib/rbac";

export default function AdminSportsConsole() {
  const [activeTab, setActiveTab] = useState<"leagues" | "fixtures">("leagues");

  const [leaguesList, setLeaguesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [newLeagueName, setNewLeagueName] = useState("");
  const [newSportType, setNewSportType] = useState<"match_based" | "racing">("match_based");
  const [newSeason, setNewSeason] = useState("2026");

  const loadLeagues = async () => {
    try {
      const res = await fetch("/api/sports/leagues");
      if (res.ok) {
        const data = (await res.json()) as any;
        if (Array.isArray(data.leagues)) {
          setLeaguesList(data.leagues);
        }
      }
    } catch (err) {
      console.error("Failed to load sports leagues:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeagues();
  }, []);

  const handleCreateLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeagueName.trim()) {
      alert("Please enter a league name.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sports/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLeagueName.trim(),
          sportType: newSportType,
          season: newSeason.trim() || "2026",
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        alert(data.error || "Failed to create league");
        return;
      }

      setNewLeagueName("");
      await loadLeagues();
    } catch (err) {
      console.error("Create league error:", err);
      alert("Failed to create league");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLeague = async (id: string) => {
    if (!confirm("Are you sure you want to delete this league?")) return;
    try {
      const res = await fetch(`/api/sports/leagues?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setLeaguesList((prev) => prev.filter((l) => l.id !== id));
      } else {
        const data = (await res.json()) as any;
        alert(data.error || "Failed to delete league");
      }
    } catch (err) {
      console.error("Delete league error:", err);
      alert("Failed to delete league");
    }
  };

  return (
    <AdminAuthGuard requiredPermission={canManageSports} featureTitle="Sports Division Console">
      <div className="container mx-auto max-w-7xl px-4 sm:px-8 pt-24 sm:pt-28 pb-12 space-y-8 text-neutral-900 dark:text-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white flex items-center gap-2.5">
            <Trophy className="h-7 w-7 text-yellow-500" /> Sports Settings
          </h1>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={activeTab === "leagues" ? "default" : "outline"}
            onClick={() => setActiveTab("leagues")}
            className="cursor-pointer"
          >
            Leagues
          </Button>
          <Button
            size="sm"
            variant={activeTab === "fixtures" ? "default" : "outline"}
            onClick={() => setActiveTab("fixtures")}
            className="cursor-pointer"
          >
            Fixtures
          </Button>
        </div>
      </div>

      {activeTab === "leagues" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Create League Form */}
          <Card className="p-6 space-y-4 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Create League</h2>
            <form onSubmit={handleCreateLeague} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1">
                  League Name
                </label>
                <Input
                  value={newLeagueName}
                  onChange={(e) => setNewLeagueName(e.target.value)}
                  placeholder="League Name"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1">
                  Type
                </label>
                <select
                  value={newSportType}
                  onChange={(e) => setNewSportType(e.target.value as any)}
                  className="w-full h-9 rounded-md border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="match_based">Match Based (Win/Draw/Loss)</option>
                  <option value="racing">Racing (Points scale)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1">
                  Season
                </label>
                <Input
                  value={newSeason}
                  onChange={(e) => setNewSeason(e.target.value)}
                  placeholder="2026"
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full font-semibold bg-[#00a9d2] hover:bg-[#0090b3] text-white cursor-pointer shadow-sm disabled:opacity-50">
                {submitting ? "Registering..." : "Register League"}
              </Button>
            </form>
          </Card>

          {/* Active Leagues List */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Leagues</h2>
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center p-8 text-neutral-500">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading leagues...
                </div>
              ) : leaguesList.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-neutral-300 dark:border-neutral-800 rounded-lg text-xs text-neutral-500">
                  No leagues found. Create a league above.
                </div>
              ) : (
                leaguesList.map((l) => (
                  <Card key={l.id} className="p-4 flex items-center justify-between border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
                    <div>
                      <h3 className="font-bold text-sm text-neutral-900 dark:text-white">{l.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        <span className="uppercase font-mono text-[10px] text-blue-600 dark:text-blue-400">
                          {l.sportType.replace("_", " ")}
                        </span>
                        <span>•</span>
                        <span>Season {l.season}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="cursor-pointer border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-white">
                        Configure
                      </Button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLeague(l.id)}
                        className="text-neutral-400 hover:text-red-500 transition cursor-pointer p-1.5"
                        title="Delete League"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "fixtures" && (
        <Card className="p-6 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none space-y-4">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Results Recording</h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Enter final scores or race podium finishes to immediately update standings.
          </p>
        </Card>
      )}
    </div>
    </AdminAuthGuard>
  );
}
