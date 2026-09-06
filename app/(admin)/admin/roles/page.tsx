"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Shield, Search, UserCheck } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
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
        alert("Failed to update role.");
      }
    } catch {
      fetchStaffUsers(searchQuery);
      alert("Error updating role.");
    }
  };

  return (
    <AdminAuthGuard requiredPermission={canAssignRoles} featureTitle="Staff Roles Management">
      <div className="container mx-auto max-w-7xl px-4 sm:px-8 py-10 space-y-8 text-neutral-900 dark:text-white">
      {/* Top Header with Back to Admin */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
          </Link>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900 dark:text-white flex items-center gap-2.5">
            <Shield className="h-7 w-7 text-blue-600 dark:text-blue-400" /> Staff Roles & Permissions
          </h1>
        </div>
      </div>

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
          className="text-xs bg-[#00a9d2] hover:bg-[#0090b3] text-white font-bold cursor-pointer shadow-sm"
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
        <div className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
          {searchQuery
            ? `Search Results (${usersList.length})`
            : `Active Staff Members (${usersList.length})`}
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500 dark:text-neutral-400">Loading user accounts...</div>
        ) : usersList.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 space-y-2 shadow-sm dark:shadow-none">
            <UserCheck className="h-8 w-8 text-neutral-400 dark:text-neutral-600 mx-auto" />
            <div className="text-sm font-bold text-neutral-900 dark:text-white">No accounts found</div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {searchQuery
                ? "No Roblox users matched your search query."
                : "No staff roles are currently assigned. Use the search bar above to look up any Roblox user."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {usersList.map((staff) => (
              <Card key={staff.id} className="p-6 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-white overflow-hidden flex items-center justify-center font-bold text-xs">
                      {staff.avatarUrl ? (
                        <img
                          src={staff.avatarUrl}
                          alt={staff.displayName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        staff.displayName.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-neutral-900 dark:text-white">{staff.displayName}</h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">@{staff.robloxUsername}</p>
                    </div>
                  </div>

                  <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                    {staff.roles.length > 0
                      ? staff.roles.map((r: string) => r.replace("_", " ")).join(", ")
                      : "No active permissions"}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                    Permissions
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_ROLES.map((role) => {
                      const isAssigned = staff.roles.includes(role.id);
                      const isLocked =
                        staff.robloxUsername?.toLowerCase() === "alphaze1" &&
                        role.id === "site_admin";
                      return (
                        <Button
                          key={role.id}
                          size="sm"
                          disabled={isLocked}
                          variant={isAssigned ? "default" : "outline"}
                          className={`text-xs cursor-pointer ${
                            isAssigned
                              ? "bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm"
                              : "border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-white"
                          } ${isLocked ? "opacity-75 cursor-not-allowed" : ""}`}
                          onClick={() => {
                            if (!isLocked) {
                              toggleRole(staff.id, role.id, isAssigned);
                            }
                          }}
                          title={isLocked ? "Root Administrator permissions are permanent" : undefined}
                        >
                          {role.name} {isLocked && "🔒"}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
    </AdminAuthGuard>
  );
}
