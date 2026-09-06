"use client";
import React from "react";
import { StandingRow } from "@/lib/sports";
import { Trophy } from "lucide-react";

export function StandingsTable({
  leagueName,
  standings,
}: {
  leagueName: string;
  standings: StandingRow[];
}) {
  return (
    <div className="p-6 rounded-3xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-2xl">
      <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h3 className="font-bold text-lg text-neutral-900 dark:text-white">{leagueName} Standings</h3>
        </div>
        <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono uppercase">Official Computation</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-neutral-700 dark:text-neutral-300">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-semibold uppercase tracking-wider">
              <th className="py-2.5 px-3">Pos</th>
              <th className="py-2.5 px-3">Team / Driver</th>
              <th className="py-2.5 px-3 text-center">Played / Races</th>
              <th className="py-2.5 px-3 text-center">Wins</th>
              <th className="py-2.5 px-3 text-center">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {standings.map((row) => (
              <tr key={row.name} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/60 transition-colors">
                <td className="py-3 px-3 font-bold text-neutral-900 dark:text-white">
                  <span className={row.rank <= 3 ? "text-amber-600 dark:text-amber-400" : "text-neutral-500 dark:text-neutral-400"}>
                    #{row.rank}
                  </span>
                </td>
                <td className="py-3 px-3 font-semibold text-neutral-900 dark:text-white">{row.name}</td>
                <td className="py-3 px-3 text-center text-neutral-600 dark:text-neutral-300">{row.playedOrRaces}</td>
                <td className="py-3 px-3 text-center text-neutral-600 dark:text-neutral-300">{row.wins}</td>
                <td className="py-3 px-3 text-center font-bold text-amber-600 dark:text-amber-400 text-sm">
                  {row.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
