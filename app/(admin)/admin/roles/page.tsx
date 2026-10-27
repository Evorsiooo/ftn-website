"use client";
import { toast } from "@/components/gs/dialogs";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, UserCheck } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader } from "@/components/gs/admin-header";
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
  const [log, setLog] = useState<{ at: Date; text: string }[]>([]);

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
    const who = usersList.find((u) => u.id === userId);
    const roleName = ALL_ROLES.find((r) => r.id === roleKey)?.name ?? roleKey;
    setLog((l) => [{ at: new Date(), text: `${currentlyAssigned ? "Removed" : "Gave"} ${roleName} ${currentlyAssigned ? "from" : "to"} @${who?.robloxUsername ?? "user"}` }, ...l].slice(0, 8));

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

  const shown = usersList;
  const counts = ALL_ROLES.map((r) => usersList.filter((u) => u.roles.includes(r.id)).length);
  const lockedFor = (u: any, roleId: string) => u.robloxUsername?.toLowerCase() === "alphaze1" && roleId === "site_admin";

  return (
    <AdminAuthGuard requiredPermission={canAssignRoles} featureTitle="Staff Roles Management">
      <div className="mx-auto max-w-6xl space-y-6 text-neutral-900 dark:text-white">
        <AdminPageHeader title="Staff roles" description="Who can do what. Tick a box to grant a role, untick to take it away; it applies immediately." />

        <form onSubmit={handleSearch} className="flex max-w-lg gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Find any Roblox user to give them a role" className="pl-9 text-xs" />
          </div>
          <Button type="submit" size="sm" className="cursor-pointer bg-brand font-bold text-brand-ink hover:bg-brand-hover">Search</Button>
          {searchQuery && (
            <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={() => { setSearchQuery(""); fetchStaffUsers(""); }}>
              Clear
            </Button>
          )}
        </form>

        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-500">Loading accounts…</div>
        ) : shown.length === 0 ? (
          <div className="space-y-2 rounded-2xl border border-dashed border-neutral-300 p-12 text-center dark:border-neutral-700">
            <UserCheck className="mx-auto h-8 w-8 text-neutral-400" />
            <div className="text-sm font-bold">No accounts found</div>
            <p className="text-xs text-neutral-500">{searchQuery ? "Nobody matched that search." : "No staff yet. Search for a Roblox user above."}</p>
          </div>
        ) : (
          <>
            {/* Matrix on wide screens */}
            <div className="hidden overflow-x-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-widest text-neutral-500">{searchQuery ? `Results (${shown.length})` : `Staff (${shown.length})`}</th>
                    {ALL_ROLES.map((r, i) => (
                      <th key={r.id} className="px-2 py-4 text-center align-bottom">
                        <div className="text-xs font-bold leading-tight">{r.name}</div>
                        <div className="mt-1 text-xs font-normal text-neutral-500">{counts[i]} {counts[i] === 1 ? "person" : "people"}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {shown.map((staff) => (
                    <tr key={staff.id}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-xs font-bold dark:bg-neutral-800">
                            {staff.avatarUrl ? <img src={staff.avatarUrl} alt="" className="h-full w-full object-cover" /> : staff.displayName.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-bold">{staff.displayName}</span>
                            <span className="block truncate text-xs text-neutral-500">@{staff.robloxUsername}</span>
                          </span>
                        </div>
                      </td>
                      {ALL_ROLES.map((role) => {
                        const on = staff.roles.includes(role.id);
                        const locked = lockedFor(staff, role.id);
                        return (
                          <td key={role.id} className="px-2 py-3 text-center">
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              aria-label={`${role.name} for ${staff.displayName}`}
                              disabled={locked}
                              title={locked ? "Root Administrator permissions are permanent" : undefined}
                              onClick={() => toggleRole(staff.id, role.id, on)}
                              className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 text-xs font-extrabold transition disabled:cursor-not-allowed ${
                                on ? "border-brand bg-brand text-brand-ink" : "border-neutral-300 text-transparent hover:border-neutral-500 dark:border-neutral-700"
                              }`}
                            >
                              {locked ? "🔒" : "✓"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pills on small screens */}
            <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 lg:hidden">
              {shown.map((staff) => (
                <li key={staff.id} className="space-y-3 p-4">
                  <div>
                    <div className="font-bold">{staff.displayName}</div>
                    <div className="text-xs text-neutral-500">@{staff.robloxUsername}</div>
                  </div>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={`Roles for ${staff.displayName}`}>
                    {ALL_ROLES.map((role) => {
                      const on = staff.roles.includes(role.id);
                      const locked = lockedFor(staff, role.id);
                      return (
                        <button
                          key={role.id}
                          type="button"
                          disabled={locked}
                          aria-pressed={on}
                          onClick={() => toggleRole(staff.id, role.id, on)}
                          className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed ${on ? "border-brand bg-brand text-brand-ink" : "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"}`}
                        >
                          {role.name}{locked && " 🔒"}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {log.length > 0 && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Changed in this session</div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {log.map((l, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>{l.text}</span>
                  <span className="shrink-0 text-neutral-500">{l.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AdminAuthGuard>
  );
}
