"use client";
import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Eye, MousePointerClick, TrendingUp, ArrowLeft, DollarSign } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { canManageAds } from "@/lib/rbac";

export default function AdminAdsConsole() {
  const [campaigns, setCampaigns] = useState([
    {
      id: "c1",
      title: "District Transit Authority Commuter Card",
      advertiserName: "Metro Transit Corp",
      format: "1024x180",
      zone: "homepage_top",
      impressionsCount: 14820,
      clicksCount: 542,
      status: "active",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    },
    {
      id: "c2",
      title: "Apex Motorsport Season 5 Grand Prix Ticket",
      advertiserName: "Apex Racing League",
      format: "512x180",
      zone: "sports_sidebar",
      impressionsCount: 8930,
      clicksCount: 412,
      status: "active",
      startDate: "2026-08-10",
      endDate: "2026-08-25",
    },
  ]);

  const [title, setTitle] = useState("");
  const [advertiser, setAdvertiser] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [format, setFormat] = useState<"1024x180" | "512x180">("1024x180");
  const [zone, setZone] = useState("homepage_top");

  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !imageUrl.trim() || !targetUrl.trim()) return;

    setCampaigns([
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        advertiserName: advertiser.trim() || "Official Partner",
        format,
        zone,
        impressionsCount: 0,
        clicksCount: 0,
        status: "active",
        startDate: "2026-08-18",
        endDate: "2026-09-18",
      },
      ...campaigns,
    ]);

    setTitle("");
    setAdvertiser("");
    setImageUrl("");
    setTargetUrl("");
    alert("Campaign created successfully.");
  };

  const totalImpressions = campaigns.reduce((acc, c) => acc + c.impressionsCount, 0);
  const totalClicks = campaigns.reduce((acc, c) => acc + c.clicksCount, 0);
  const averageCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00";

  return (
    <AdminAuthGuard requiredPermission={canManageAds} featureTitle="Commercial & Advertisements Console">
      <div className="container mx-auto max-w-7xl px-4 sm:px-8 py-10 space-y-8 text-neutral-900 dark:text-white">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
        </Link>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900 dark:text-white flex items-center gap-2.5">
          <DollarSign className="h-7 w-7 text-emerald-600 dark:text-emerald-400" /> Commercial Advertisements
        </h1>
      </div>

      {/* Analytics Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none flex items-center justify-between">
          <div>
            <span className="text-xs text-neutral-600 dark:text-neutral-400 uppercase font-semibold">Impressions</span>
            <p className="text-2xl font-black text-neutral-900 dark:text-white mt-1">{totalImpressions.toLocaleString()}</p>
          </div>
          <Eye className="h-8 w-8 text-blue-500" />
        </Card>

        <Card className="p-5 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none flex items-center justify-between">
          <div>
            <span className="text-xs text-neutral-600 dark:text-neutral-400 uppercase font-semibold">Clicks</span>
            <p className="text-2xl font-black text-neutral-900 dark:text-white mt-1">{totalClicks.toLocaleString()}</p>
          </div>
          <MousePointerClick className="h-8 w-8 text-neutral-700 dark:text-white" />
        </Card>

        <Card className="p-5 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none flex items-center justify-between">
          <div>
            <span className="text-xs text-neutral-600 dark:text-neutral-400 uppercase font-semibold">CTR</span>
            <p className="text-2xl font-black text-neutral-900 dark:text-white mt-1">{averageCtr}%</p>
          </div>
          <TrendingUp className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create Campaign Form */}
        <Card className="p-6 space-y-4 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Create Campaign</h2>
          <form onSubmit={handleCreateCampaign} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1">
                Campaign Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1">
                Advertiser
              </label>
              <Input
                value={advertiser}
                onChange={(e) => setAdvertiser(e.target.value)}
                placeholder="Organization name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1">
                  Format
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as any)}
                  className="w-full h-9 rounded-md border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="1024x180">1024x180</option>
                  <option value="512x180">512x180</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1">
                  Zone
                </label>
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  className="w-full h-9 rounded-md border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="homepage_top">Homepage Top</option>
                  <option value="articles_inline">Articles Inline</option>
                  <option value="sports_sidebar">Sports Sidebar</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1">
                Image URL
              </label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Image URL"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1">
                Destination URL
              </label>
              <Input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <Button type="submit" className="w-full font-semibold bg-[#00a9d2] hover:bg-[#0090b3] text-white cursor-pointer shadow-sm">
              Save Campaign
            </Button>
          </form>
        </Card>

        {/* Active Campaigns Table */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Active Campaigns</h2>
          <div className="space-y-3">
            {campaigns.map((c) => (
              <Card key={c.id} className="p-4 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-white">{c.title}</h3>
                  <span className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400">{c.format}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
                  <span>Client: {c.advertiserName}</span>
                  <span>Zone: {c.zone}</span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-200 dark:border-neutral-800">
                  <span>Impressions: <strong className="text-neutral-900 dark:text-white">{c.impressionsCount.toLocaleString()}</strong></span>
                  <span>Clicks: <strong className="text-neutral-900 dark:text-white">{c.clicksCount}</strong></span>
                  <span>CTR: <strong className="text-neutral-900 dark:text-white">{c.impressionsCount > 0 ? ((c.clicksCount / c.impressionsCount) * 100).toFixed(2) : 0}%</strong></span>
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
