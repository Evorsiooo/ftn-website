"use client";
import React, { useState, useEffect } from "react";
import { Clock, User } from "lucide-react";

interface ScheduleItem {
  title: string;
  description: string;
  day: string;
  startUtc: number; // e.g. 8 for 08:00
  endUtc: number;   // e.g. 10 for 10:00
  timeStringUtc: string;
  presenter: string;
}

const SHOWS: ScheduleItem[] = [
  {
    title: "Morning District Briefing",
    description: "Daily morning news digest covering municipality updates, markets, and transit.",
    day: "Monday - Friday",
    startUtc: 8,
    endUtc: 10,
    timeStringUtc: "08:00 - 10:00 UTC",
    presenter: "Elena Vance",
  },
  {
    title: "The State of Roblox Politics",
    description: "Weekly live roundtable debate and call-in discussions on civic policies.",
    day: "Wednesdays",
    startUtc: 20,
    endUtc: 22,
    timeStringUtc: "20:00 - 22:00 UTC",
    presenter: "Broadcast Panel",
  },
  {
    title: "Sports Grandstand Live Telemetry",
    description: "Live match commentary, telemetry, and analysis across active championships.",
    day: "Saturdays",
    startUtc: 14,
    endUtc: 17,
    timeStringUtc: "14:00 - 17:00 UTC",
    presenter: "Sports Division",
  },
  {
    title: "Friday Night Pulse DJ Mix",
    description: "High-energy house, synthwave, and underground electronic beats.",
    day: "Fridays",
    startUtc: 21,
    endUtc: 25, // 01:00 UTC
    timeStringUtc: "21:00 - 01:00 UTC",
    presenter: "DJ Nova",
  },
];

export function ScheduleGrid() {
  const [localOffset, setLocalOffset] = useState<number | null>(null);
  const [timeZoneName, setTimeZoneName] = useState<string>("");

  useEffect(() => {
    try {
      const offsetHours = -new Date().getTimezoneOffset() / 60;
      setLocalOffset(offsetHours);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimeZoneName(tz);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const formatLocalTime = (startHourUtc: number, endHourUtc: number) => {
    if (localOffset === null) return "";
    const startLocal = (startHourUtc + localOffset + 24) % 24;
    const endLocal = (endHourUtc + localOffset + 24) % 24;

    const pad = (n: number) => Math.floor(n).toString().padStart(2, "0") + ":00";
    return `${pad(startLocal)} - ${pad(endLocal)} Local`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h2 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">Schedule</h2>
        {timeZoneName && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
            Times converted to your local timezone: {timeZoneName}
          </span>
        )}
      </div>

      {/* Chronological List of Programs */}
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none rounded-2xl overflow-hidden">
        {SHOWS.map((show, i) => {
          const localString = formatLocalTime(show.startUtc, show.endUtc);
          return (
            <div
              key={i}
              className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-50 dark:hover:bg-neutral-900/60 transition-colors"
            >
              {/* Left Column: Day & Time */}
              <div className="md:w-72 shrink-0 space-y-1">
                <div className="font-bold text-sm text-neutral-900 dark:text-white">
                  {show.day} {show.timeStringUtc}
                </div>
                {localString && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-mono">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{localString}</span>
                  </div>
                )}
              </div>

              {/* Center Column: Show Info & Description */}
              <div className="flex-1 space-y-1">
                <h3 className="text-base font-bold text-neutral-900 dark:text-white leading-snug">
                  {show.title}
                </h3>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-2xl">
                  {show.description}
                </p>
              </div>

              {/* Right Column: Presenter */}
              <div className="md:w-48 shrink-0 flex items-center md:justify-end gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <User className="h-3.5 w-3.5" />
                <span className="font-semibold">{show.presenter}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
