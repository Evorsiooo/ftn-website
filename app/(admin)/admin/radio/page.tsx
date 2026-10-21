"use client";
import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import Link from "next/link";
import { ArrowLeft, Radio, Trash2, Loader2 } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { canManageRadio } from "@/lib/rbac";

export default function AdminRadioConsole() {
  const [scheduleList, setScheduleList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newPresenter, setNewPresenter] = useState("");
  const [newDay, setNewDay] = useState("Monday");
  const [newTime, setNewTime] = useState("12:00 - 14:00");

  const loadSchedule = async () => {
    try {
      const res = await fetch("/api/radio/schedule");
      if (res.ok) {
        const data = (await res.json()) as any;
        if (Array.isArray(data.schedule)) {
          setScheduleList(data.schedule);
        }
      }
    } catch (err) {
      console.error("Failed to load radio schedule:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedule();
  }, []);

  const handleAddShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      alert("Please enter a show title.");
      return;
    }

    setSubmitting(true);
    const updated = [
      ...scheduleList,
      {
        id: crypto.randomUUID(),
        title: newTitle.trim(),
        presenter: newPresenter.trim() || "Broadcast Staff",
        day: newDay,
        time: newTime.trim(),
      },
    ];

    try {
      const res = await fetch("/api/radio/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: updated }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        alert(data.error || "Failed to save schedule");
        return;
      }

      setScheduleList(data.schedule || updated);
      setNewTitle("");
      setNewPresenter("");
    } catch (err) {
      console.error("Failed to save schedule:", err);
      alert("Failed to save schedule");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteShow = async (id: string) => {
    if (!confirm("Are you sure you want to remove this show from the schedule?")) return;
    const updated = scheduleList.filter((item) => item.id !== id);
    try {
      const res = await fetch("/api/radio/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: updated }),
      });
      if (res.ok) {
        setScheduleList(updated);
      } else {
        const data = (await res.json()) as any;
        alert(data.error || "Failed to remove show");
      }
    } catch (err) {
      console.error("Delete show error:", err);
      alert("Failed to remove show");
    }
  };

  return (
    <AdminAuthGuard requiredPermission={canManageRadio} featureTitle="Webradio Broadcast Console">
      <div className="container mx-auto max-w-7xl px-4 sm:px-8 pt-24 sm:pt-28 pb-12 space-y-8 text-neutral-900 dark:text-white">
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

            <Button type="submit" disabled={submitting} className="w-full font-semibold bg-[#00a9d2] hover:bg-[#0090b3] text-white cursor-pointer shadow-sm disabled:opacity-50">
              {submitting ? "Adding..." : "Add Slot"}
            </Button>
          </form>
        </Card>

        {/* Existing Timetable List */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Current Schedule</h2>
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center p-8 text-neutral-500">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading schedule...
              </div>
            ) : scheduleList.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-neutral-300 dark:border-neutral-800 rounded-lg text-xs text-neutral-500">
                No schedule slots found. Add a show slot using the form.
              </div>
            ) : (
              scheduleList.map((item) => (
                <Card key={item.id} className="p-4 flex items-center justify-between border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
                  <div>
                    <h3 className="font-bold text-sm text-neutral-900 dark:text-white">{item.title || item.show}</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">DJ: {item.presenter}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400 uppercase">{item.day}</span>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{item.time}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteShow(item.id)}
                      className="text-neutral-400 hover:text-red-500 transition cursor-pointer p-1"
                      title="Remove Slot"
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
    </div>
    </AdminAuthGuard>
  );
}
