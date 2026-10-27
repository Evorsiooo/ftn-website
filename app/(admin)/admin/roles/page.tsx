"use client";
import { toast } from "@/components/gs/dialogs";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Shield, Search, UserCheck } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader, AdminTab } from "@/components/gs/admin-header";
import { canAssignRoles } from "@/lib/rbac";

const ALL_ROLES = [
  { id: "site_admin", name: "Site Administrator" },
  { id: "manager", name: "Operations Manager" },
  { id: "digital_publishing", name: "Digital Publishing" },
  { id: "sports_division", name: "Sports Division" },
  { id: "broadcast_division", name: "Broadcast Division" },
  { id: "commercial_division", name: "Commercial & Ads" },
  { id: "graphic_design", name: "Graphic Design" },
];

export default function AdminRolesConsole() {
  const [usersList, setUsersList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchStaffUsers = (query: string = "") => {
    setLoading(true);
    const url = query.trim()
      ? `/api/admin/users?search=${encodeURIComponent(query.trim())}`
      : `/api/admin/users`;

    fetch(url)
      .then((res) => res.json())
      .then((data: any) => {
        if (data && Array.isArray(data.users)) {
          setUsersList(data.users);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStaffUsers();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStaffUsers(searchQuery);
  };

  const toggleRole = async (userId: string, roleKey: string, currentlyAssigned: boolean) => {
    const action = currentlyAssigned ? "revoke" : "grant";

    // Optimistic UI update
    setUsersList((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        const updated = currentlyAssigned
          ? u.roles.filter((r: string) => r !== roleKey)
          : [...u.roles, roleKey];
        return { ...u, roles: updated };
      })
    );

    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: userId,
          role: roleKey,
          action,
        }),
      });

      if (!res.ok) {
        // Revert on error
        fetchStaffUsers(searchQuery);
        toast("Failed to update role.");
      }
    } catch {
      fetchStaffUsers(searchQuery);
      toast("Error updating role.");
    }
  };

  return (
    <AdminAuthGuard requiredPermission={canAssignRoles} featureTitle="Staff Roles Management">
      <div className="mx-auto max-w-6xl space-y-8 text-neutral-900 dark:text-white">
      <AdminPageHeader title="Staff roles" description="Grant and revoke permissions to Roblox staff members." />

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400 dark:text-neutral-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Roblox username or display name..."
            className="pl-9 text-xs"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          className="text-xs bg-brand hover:bg-brand-hover text-brand-ink font-bold cursor-pointer shadow-sm"
        >
          Search Users
        </Button>
        {searchQuery && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery("");
              fetchStaffUsers("");
            }}
            className="text-xs border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-white cursor-pointer"
          >
            Clear
          </Button>
        )}
      </form>

      {/* Users List */}
      <div className="space-y-4">
        <div className="text-sm font-bold text-neutral-600 dark:text-neutral-400">
          {searchQuery
            ? `Search Results (${usersList.length})`
            : `Active Staff Members (${usersList.length})`}
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500 dark:text-neutral-400">Loading user accounts...</div>
        ) : usersList.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 space-y-2 shadow-sm dark:shadow-none">
            <UserCheck className="h-8 w-8 text-neutral-400 dark:text-neutral-600 mx-auto" />
            <div className="text-sm font-bold text-neutral-900 dark:text-white">No accounts found</div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {searchQuery
                ? "No Roblox users matched your search query."
                : "No staff roles are currently assigned. Use the search bar above to look up any Roblox user."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
            {usersList.map((staff) => (
              <li key={staff.id} className="grid gap-4 p-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-xs font-bold text-neutral-800 dark:bg-neutral-800 dark:text-white">
                    {staff.avatarUrl ? (
                      <img src={staff.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      staff.displayName.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold">{staff.displayName}</h3>
                    <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">@{staff.robloxUsername}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2" role="group" aria-label={`Roles for ${staff.displayName}`}>
                  {ALL_ROLES.map((role) => {
                    const isAssigned = staff.roles.includes(role.id);
                    const isLocked = staff.robloxUsername?.toLowerCase() === "alphaze1" && role.id === "site_admin";
                    return (
                      <button
                        key={role.id}
                        type="button"
                        disabled={isLocked}
                        aria-pressed={isAssigned}
                        onClick={() => toggleRole(staff.id, role.id, isAssigned)}
                        title={isLocked ? "Root Administrator permissions are permanent" : undefined}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed ${
                          isAssigned
                            ? "border-brand bg-brand text-brand-ink"
                            : "border-neutral-300 text-neutral-600 hover:border-neutral-500 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-white"
                        }`}
                      >
                        {role.name}
                        {isLocked && <span aria-hidden>🔒</span>}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
    </AdminAuthGuard>
  );
}
