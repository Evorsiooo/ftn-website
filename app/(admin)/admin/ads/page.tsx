"use client";
import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Eye, MousePointerClick, TrendingUp, ArrowLeft, DollarSign, Trash2, Loader2 } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { canManageAds } from "@/lib/rbac";

export default function AdminAdsConsole() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [advertiser, setAdvertiser] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [format, setFormat] = useState<"1024x180" | "512x180">("1024x180");
  const [zone, setZone] = useState("homepage_top");

  const loadCampaigns = async () => {
    try {
      const res = await fetch("/api/admin/ads");
      if (res.ok) {
        const data = (await res.json()) as any;
        if (Array.isArray(data.campaigns)) {
          setCampaigns(data.campaigns);
        }
      }
    } catch (err) {
      console.error("Failed to load campaigns:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !imageUrl.trim() || !targetUrl.trim()) {
      alert("Please fill in all required fields (title, image URL, and destination URL).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          advertiserName: advertiser.trim() || "Official Partner",
          format,
          zone,
          imageUrl: imageUrl.trim(),
          targetUrl: targetUrl.trim(),
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        alert(data.error || "Failed to create campaign");
        return;
      }

      setTitle("");
      setAdvertiser("");
      setImageUrl("");
      setTargetUrl("");
      await loadCampaigns();
    } catch (err) {
      console.error("Create campaign error:", err);
      alert("An unexpected error occurred while saving the campaign.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm("Are you sure you want to delete this ad campaign?")) return;
    try {
      const res = await fetch(`/api/admin/ads?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setCampaigns((prev) => prev.filter((c) => c.id !== id));
      } else {
        const data = (await res.json()) as any;
        alert(data.error || "Failed to delete campaign");
      }
    } catch (err) {
      console.error("Delete campaign error:", err);
      alert("Failed to delete campaign");
    }
  };

  const totalImpressions = campaigns.reduce((acc, c) => acc + (c.impressionsCount || 0), 0);
  const totalClicks = campaigns.reduce((acc, c) => acc + (c.clicksCount || 0), 0);
  const averageCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00";

  return (
    <AdminAuthGuard requiredPermission={canManageAds} featureTitle="Commercial & Advertisements Console">
      <div className="container mx-auto max-w-7xl px-4 sm:px-8 pt-24 sm:pt-28 pb-12 space-y-8 text-neutral-900 dark:text-white">
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

            <Button type="submit" disabled={submitting} className="w-full font-semibold bg-[#00a9d2] hover:bg-[#0090b3] text-white cursor-pointer shadow-sm disabled:opacity-50">
              {submitting ? "Saving..." : "Save Campaign"}
            </Button>
          </form>
        </Card>

        {/* Active Campaigns Table */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Active Campaigns</h2>
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center p-8 text-neutral-500">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading campaigns...
              </div>
            ) : campaigns.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-neutral-300 dark:border-neutral-800 rounded-lg text-xs text-neutral-500">
                No active campaigns found. Create your first campaign above.
              </div>
            ) : (
              campaigns.map((c) => (
                <Card key={c.id} className="p-4 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-neutral-900 dark:text-white">{c.title || c.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400">{c.format || (c.zone === "sidebar_rectangle" ? "512x180" : "1024x180")}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCampaign(c.id)}
                        className="text-neutral-400 hover:text-red-500 transition cursor-pointer p-1"
                        title="Delete Campaign"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
                    <span>Client: {c.advertiserName}</span>
                    <span>Zone: {c.zone}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-200 dark:border-neutral-800">
                    <span>Impressions: <strong className="text-neutral-900 dark:text-white">{(c.impressionsCount || 0).toLocaleString()}</strong></span>
                    <span>Clicks: <strong className="text-neutral-900 dark:text-white">{c.clicksCount || 0}</strong></span>
                    <span>CTR: <strong className="text-neutral-900 dark:text-white">{(c.impressionsCount || 0) > 0 ? (((c.clicksCount || 0) / c.impressionsCount) * 100).toFixed(2) : "0.00"}%</strong></span>
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
