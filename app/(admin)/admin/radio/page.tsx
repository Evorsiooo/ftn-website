"use client";
import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import Link from "next/link";
import { ArrowLeft, Radio } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { canManageRadio } from "@/lib/rbac";

export default function AdminRadioConsole() {
  const [scheduleList, setScheduleList] = useState([
    { id: "1", title: "Morning District Briefing", presenter: "Elena Vance", day: "Monday", time: "08:00 - 10:00" },
    { id: "2", title: "The State of Roblox Politics", presenter: "Broadcast Panel", day: "Wednesday", time: "20:00 - 22:00" },
    { id: "3", title: "Friday Night Pulse DJ Mix", presenter: "DJ Nova", day: "Friday", time: "21:00 - 01:00" },
  ]);

  const [newTitle, setNewTitle] = useState("");
  const [newPresenter, setNewPresenter] = useState("");
  const [newDay, setNewDay] = useState("Monday");
  const [newTime, setNewTime] = useState("12:00 - 14:00");

  const handleAddShow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setScheduleList([
      ...scheduleList,
      {
        id: crypto.randomUUID(),
        title: newTitle.trim(),
        presenter: newPresenter.trim() || "Broadcast Staff",
        day: newDay,
        time: newTime.trim(),
      },
    ]);
    setNewTitle("");
    setNewPresenter("");
    alert("Program slot added successfully.");
  };

  return (
    <AdminAuthGuard requiredPermission={canManageRadio} featureTitle="Webradio Broadcast Console">
      <div className="container mx-auto max-w-7xl px-4 sm:px-8 py-10 space-y-8 text-neutral-900 dark:text-white">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
        </Link>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900 dark:text-white flex items-center gap-2.5">
          <Radio className="h-7 w-7 text-blue-600 dark:text-blue-400" /> Webradio Schedule
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Add Show Form */}
        <Card className="p-6 space-y-4 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Add Show</h2>
          <form onSubmit={handleAddShow} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1">
                Show Title
              </label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Show Title"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1">
                Presenter / DJ
              </label>
              <Input
                value={newPresenter}
                onChange={(e) => setNewPresenter(e.target.value)}
                placeholder="DJ Name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1">
                  Day
                </label>
                <select
                  value={newDay}
                  onChange={(e) => setNewDay(e.target.value)}
                  className="w-full h-9 rounded-md border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="Monday">Monday</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                  <option value="Friday">Friday</option>
                  <option value="Saturday">Saturday</option>
                  <option value="Sunday">Sunday</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1">
                  Time Slot (UTC)
                </label>
                <Input
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  placeholder="14:00 - 16:00"
                />
              </div>
            </div>

            <Button type="submit" className="w-full font-semibold bg-[#00a9d2] hover:bg-[#0090b3] text-white cursor-pointer shadow-sm">
              Add Slot
            </Button>
          </form>
        </Card>

        {/* Existing Timetable List */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Current Schedule</h2>
          <div className="space-y-3">
            {scheduleList.map((item) => (
              <Card key={item.id} className="p-4 flex items-center justify-between border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-white">{item.title}</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">DJ: {item.presenter}</p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400 uppercase">{item.day}</span>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{item.time}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
    </AdminAuthGuard>
  );
}
