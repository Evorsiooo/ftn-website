"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { Shield, Newspaper, Trophy, Radio, DollarSign, MessageSquare, Settings } from "lucide-react";
import {
  canPublishArticles,
  canManageRadio,
  canManageSports,
  canManageAds,
  canAssignRoles,
  canConfigureSite,
} from "@/lib/rbac";

export default function AdminCentralDashboard() {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data: any) => {
        if (data && data.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const roles = currentUser?.roles || [];

  const showArticles = canPublishArticles(roles);
  const showSports = canManageSports(roles);
  const showRadio = canManageRadio(roles);
  const showAds = canManageAds(roles);
  const showTips = canPublishArticles(roles) || canConfigureSite(roles);
  const showRoles = canAssignRoles(roles);
  const showSettings = canConfigureSite(roles);

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-8 py-10 space-y-8 text-neutral-900 dark:text-white">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900 dark:text-white">
          Admin Portal
        </h1>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
          Authorized management consoles matching your staff permissions.
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-neutral-500 dark:text-neutral-400">Loading authorized modules...</div>
      ) : (
        <BentoGrid className="max-w-7xl mx-auto md:auto-rows-[14rem]">
          {showArticles && (
            <BentoGridItem
              title="Articles"
              description="Create, edit, and publish stories and news investigations."
              header={
                <Link href="/admin/articles" className="flex flex-1 w-full h-full min-h-[5rem] rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-200 border border-neutral-300 text-neutral-900 p-4 flex-col justify-between hover:border-neutral-400 dark:from-neutral-900 dark:to-neutral-800 dark:border-transparent dark:text-white dark:hover:border-neutral-700 transition-all shadow-sm dark:shadow-none">
                  <Newspaper className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">Open Articles →</span>
                </Link>
              }
              className="md:col-span-1"
            />
          )}

          {showSports && (
            <BentoGridItem
              title="Sports Settings"
              description="Manage league rosters and record match or race scores."
              header={
                <Link href="/admin/sports" className="flex flex-1 w-full h-full min-h-[5rem] rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-200 border border-neutral-300 text-neutral-900 p-4 flex-col justify-between hover:border-neutral-400 dark:from-neutral-900 dark:to-neutral-800 dark:border-transparent dark:text-white dark:hover:border-neutral-700 transition-all shadow-sm dark:shadow-none">
                  <Trophy className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">Open Sports Settings →</span>
                </Link>
              }
              className="md:col-span-1"
            />
          )}

          {showRadio && (
            <BentoGridItem
              title="Webradio"
              description="Manage the 24/7 web radio weekly timetable and DJs."
              header={
                <Link href="/admin/radio" className="flex flex-1 w-full h-full min-h-[5rem] rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-200 border border-neutral-300 text-neutral-900 p-4 flex-col justify-between hover:border-neutral-400 dark:from-neutral-900 dark:to-neutral-800 dark:border-transparent dark:text-white dark:hover:border-neutral-700 transition-all shadow-sm dark:shadow-none">
                  <Radio className="h-6 w-6 text-red-600 dark:text-red-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">Open Webradio →</span>
                </Link>
              }
              className="md:col-span-1"
            />
          )}

          {showAds && (
            <BentoGridItem
              title="Advertisements"
              description="Manage banner placements and track click metrics."
              header={
                <Link href="/admin/ads" className="flex flex-1 w-full h-full min-h-[5rem] rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-200 border border-neutral-300 text-neutral-900 p-4 flex-col justify-between hover:border-neutral-400 dark:from-neutral-900 dark:to-neutral-800 dark:border-transparent dark:text-white dark:hover:border-neutral-700 transition-all shadow-sm dark:shadow-none">
                  <DollarSign className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">Open Advertisements →</span>
                </Link>
              }
              className="md:col-span-1"
            />
          )}

          {showTips && (
            <BentoGridItem
              title="Tipline"
              description="Review anonymous investigative leads and reports."
              header={
                <Link href="/admin/tips" className="flex flex-1 w-full h-full min-h-[5rem] rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-200 border border-neutral-300 text-neutral-900 p-4 flex-col justify-between hover:border-neutral-400 dark:from-neutral-900 dark:to-neutral-800 dark:border-transparent dark:text-white dark:hover:border-neutral-700 transition-all shadow-sm dark:shadow-none">
                  <MessageSquare className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">Open Tipline →</span>
                </Link>
              }
              className="md:col-span-1"
            />
          )}

          {showRoles && (
            <BentoGridItem
              title="Staff Roles"
              description="Grant and revoke permissions to Roblox staff members."
              header={
                <Link href="/admin/roles" className="flex flex-1 w-full h-full min-h-[5rem] rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-200 border border-neutral-300 text-neutral-900 p-4 flex-col justify-between hover:border-neutral-400 dark:from-neutral-900 dark:to-neutral-800 dark:border-transparent dark:text-white dark:hover:border-neutral-700 transition-all shadow-sm dark:shadow-none">
                  <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">Open Staff Roles →</span>
                </Link>
              }
              className="md:col-span-1"
            />
          )}

          {showSettings && (
            <BentoGridItem
              title="Site Settings"
              description="Configure live audio stream URL and system feeds."
              header={
                <Link href="/admin/settings" className="flex flex-1 w-full h-full min-h-[5rem] rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-200 border border-neutral-300 text-neutral-900 p-4 flex-col justify-between hover:border-neutral-400 dark:from-neutral-900 dark:to-neutral-800 dark:border-transparent dark:text-white dark:hover:border-neutral-700 transition-all shadow-sm dark:shadow-none">
                  <Settings className="h-6 w-6 text-neutral-700 dark:text-neutral-300" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">Open Site Settings →</span>
                </Link>
              }
              className="md:col-span-1"
            />
          )}
        </BentoGrid>
      )}
    </div>
  );
}
