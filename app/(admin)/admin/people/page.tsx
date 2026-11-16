"use client";
import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, Key, Lock, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { Select } from "@/components/ui/select";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { Body, Field, Line, PageBar, Pill, SaveBar, Screen, Section, Seg, Sheet, Switch, formatDay, hm } from "@/components/admin/ui";
import { useSiteConfig, type SiteConfig } from "@/components/admin/settings/use-site-config";
import { isRootAdmin } from "@/lib/root-admin";
import { canAssignRoles, canConfigureSite, canModerateUsers } from "@/lib/rbac";
import { fetchSession } from "@/lib/session-client";
import { cn } from "@/lib/utils";

const ALL_ROLES = [
  { id: "site_admin", name: "Site Administrator", short: "Site admin" },
  { id: "manager", name: "Operations Manager", short: "Operations" },
  { id: "digital_publishing", name: "Digital Publishing", short: "Publishing" },
  { id: "sports_division", name: "Sports Division", short: "Sports" },
  { id: "broadcast_division", name: "Broadcast Division", short: "Broadcast" },
  { id: "commercial_division", name: "Commercial & Ads", short: "Ads" },
  { id: "graphic_design", name: "Graphic Design", short: "Design" },
];
const DURATIONS = [
  { value: "24h", label: "24 hours" },
  { value: "1w", label: "1 week" },
  { value: "1m", label: "1 month" },
  { value: "indefinite", label: "Until unmuted" },
] as const;
const durationLabel = (d: string) => DURATIONS.find((x) => x.value === d)?.label ?? d;

type Tab = "staff" | "accounts" | "muted";

function Avatar({ url, name, size = 32 }: { url?: string | null; name?: string; size?: number }) {
  return (
    <span className="ava" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : (name || "?").slice(0, 2).toUpperCase()}
    </span>
  );
}

function PeoplePage() {
  const router = useRouter();
  const params = useSearchParams();
  const [roles, setRoles] = useState<string[] | null>(null);
  useEffect(() => {
    fetchSession()
      .then((d: any) => setRoles(d?.user?.roles ?? []))
      .catch(() => setRoles([]));
  }, []);
  const mayRoles = canAssignRoles(roles ?? []);
  const mayAccounts = canConfigureSite(roles ?? []);
  const mayMute = canModerateUsers(roles ?? []);

  const asked = params.get("tab") as Tab | null;
  const tabs: { value: Tab; label: string; n?: number }[] = [];
  if (mayRoles) tabs.push({ value: "staff", label: "Staff" });
  if (mayAccounts) tabs.push({ value: "accounts", label: "Accounts" });
  if (mayMute) tabs.push({ value: "muted", label: "Muted" });
  const tab: Tab = tabs.find((t) => t.value === asked)?.value ?? tabs[0]?.value ?? "staff";
  const setTab = (t: Tab) => router.replace(t === "staff" ? "/admin/people" : `/admin/people?tab=${t}`, { scroll: false });

  const c = useSiteConfig({ people: true });
  const mutedTab = tabs.find((t) => t.value === "muted");
  if (mutedTab) mutedTab.n = c.moderations.length;

  // Staff (roles)
  const [usersList, setUsersList] = useState<any[] | null>(null);
  const [searchQuery, setSearchQuery] = useState(params.get("q") || "");
  const [log, setLog] = useState<{ at: Date; text: string }[]>([]);
  const [personId, setPersonId] = useState<string | null>(null);

  const fetchStaffUsers = (query: string = "") => {
    setUsersList(null);
    const url = query.trim() ? `/api/admin/users?search=${encodeURIComponent(query.trim())}` : `/api/admin/users`;
    fetch(url)
      .then((res) => res.json())
      .then((data: any) => setUsersList(data && Array.isArray(data.users) ? data.users : []))
      .catch(() => setUsersList([]));
  };
  useEffect(() => {
    if (mayRoles) fetchStaffUsers(searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mayRoles]);

  const lockedFor = (u: any, roleId: string) => isRootAdmin(u.robloxId) && roleId === "site_admin";

  const toggleRole = async (userId: string, roleKey: string, currentlyAssigned: boolean) => {
    const action = currentlyAssigned ? "revoke" : "grant";
    const who = usersList?.find((u) => u.id === userId);
    const roleName = ALL_ROLES.find((r) => r.id === roleKey)?.name ?? roleKey;
    setLog((l) => [{ at: new Date(), text: `${currentlyAssigned ? "Removed" : "Gave"} ${roleName} ${currentlyAssigned ? "from" : "to"} @${who?.robloxUsername ?? "user"}` }, ...l].slice(0, 8));
    setUsersList((prev) => (prev || []).map((u) => (u.id !== userId ? u : { ...u, roles: currentlyAssigned ? u.roles.filter((r: string) => r !== roleKey) : [...u.roles, roleKey] })));
    try {
      const res = await fetch("/api/admin/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUserId: userId, role: roleKey, action }) });
      if (!res.ok) {
        fetchStaffUsers(searchQuery);
        toast("Failed to update role.");
      }
    } catch {
      fetchStaffUsers(searchQuery);
      toast("Error updating role.");
    }
  };

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "accounts") {
      c.setUserSearchQuery(searchQuery);
      c.handleSearchUsers(searchQuery);
    } else fetchStaffUsers(searchQuery);
  };
  const clear = () => {
    setSearchQuery("");
    if (tab === "accounts") c.handleSearchUsers("");
    else fetchStaffUsers("");
  };

  const users = usersList || [];
  const history = users
    .flatMap((u) =>
      (u.grants ?? [])
        .filter((g: any) => g.at)
        .map((g: any) => ({ at: new Date(g.at), text: `${ALL_ROLES.find((r) => r.id === g.role)?.name ?? g.role} given to @${u.robloxUsername}${g.by ? ` by @${g.by}` : ""}` }))
    )
    .sort((a, b) => +b.at - +a.at)
    .slice(0, 8);
  const counts = ALL_ROLES.map((r) => users.filter((u) => u.roles.includes(r.id)).length);
  const person = personId ? users.find((u) => u.id === personId) ?? c.searchedUsers.find((u) => u.id === personId) ?? null : null;

  const openPerson = (u: any) => {
    setPersonId(u.id);
    c.setSelectedUserToMute(u.id);
    c.setMuteReason("");
  };

  const searchBox = (style?: React.CSSProperties) =>
    tab === "muted" ? null : (
      <form onSubmit={search} className="search" style={style}>
        <Search />
        <input className="input sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={tab === "accounts" ? "Find an account" : "Find any Roblox user"} aria-label="Find a person" type="search" />
      </form>
    );

  // Moderation rules (site administrators): own save bar.
  const ruleSections = mayAccounts && tab === "muted" ? ["automod", "profanity"] : [];
  const dirtyRules = c.dirtySections.filter((id) => ruleSections.includes(id));

  if (roles === null) return null;

  return (
    <Screen>
      <PageBar
        title="People"
        tools={
          <>
            {tabs.length > 1 && <Seg value={tab} onChange={setTab} options={tabs} label="Show" />}
            {searchBox({ width: 260 })}
            {searchQuery && tab !== "muted" && (
              <button type="button" className="btn sm ghost" onClick={clear}>
                Clear
              </button>
            )}
          </>
        }
        mrow={
          <>
            {tabs.length > 1 && (
              <select className="select sm" style={{ flex: tab === "muted" ? 1 : "none", width: tab === "muted" ? undefined : 120 }} value={tab} onChange={(e) => setTab(e.target.value as Tab)} aria-label="Show">
                {tabs.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                    {t.n ? ` (${t.n})` : ""}
                  </option>
                ))}
              </select>
            )}
            {searchBox({ flex: 1 })}
          </>
        }
      />
      <Body scroll>
        {tab === "staff" && mayRoles && (
          <div className="people">
            {usersList === null ? (
              <div className="empty">Loading people…</div>
            ) : users.length === 0 ? (
              <div className="empty">{searchQuery ? "Nobody matched that search." : "No staff yet. Find a Roblox user above to give them a role."}</div>
            ) : (
              <table className="table roles-table">
                <thead>
                  <tr>
                    <th className="who">{searchQuery ? `Results (${users.length})` : `Staff (${users.length})`}</th>
                    {ALL_ROLES.map((r, i) => (
                      <th key={r.id} className="rc" title={r.name}>
                        {r.short}
                        <span className="t12 muted" style={{ fontWeight: 500 }}>
                          {" "}
                          {counts[i]}
                        </span>
                      </th>
                    ))}
                    <th className="rn">Roles</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={cn("click", personId === u.id && "on")}>
                      <td className="who" onClick={() => openPerson(u)}>
                        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <Avatar url={u.avatarUrl} name={u.displayName} />
                          <span style={{ minWidth: 0 }}>
                            <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                              {u.displayName}
                            </span>
                            <span className="t12 muted trunc" style={{ display: "block" }}>
                              @{u.robloxUsername}
                            </span>
                          </span>
                        </span>
                      </td>
                      {ALL_ROLES.map((role) => {
                        const on = u.roles.includes(role.id);
                        const locked = lockedFor(u, role.id);
                        return (
                          <td key={role.id} className="rc">
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              aria-label={`${role.name} for ${u.displayName}`}
                              disabled={locked}
                              title={locked ? "The root administrator keeps this role" : role.name}
                              onClick={() => toggleRole(u.id, role.id, on)}
                              className={cn("rolebox", on && "on")}
                            >
                              {locked ? <Lock className="ic-sm" /> : on ? <Check className="ic-sm" /> : null}
                            </button>
                          </td>
                        );
                      })}
                      <td className="rn t12 muted" onClick={() => openPerson(u)}>
                        {u.roles.length ? `${u.roles.length} ${u.roles.length === 1 ? "role" : "roles"}` : "None"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {(log.length > 0 || history.length > 0) && (
              <section className="todo" style={{ maxWidth: 760 }}>
                <h2>Recent role changes</h2>
                <div className="rows">
                  {log.map((l, i) => (
                    <div key={`s${i}`} className="r">
                      <span className="grow">
                        {l.text} <span className="muted">(just now)</span>
                      </span>
                      <span className="t12 muted num">{hm(l.at)}</span>
                    </div>
                  ))}
                  {history.map((l, i) => (
                    <div key={`h${i}`} className="r">
                      <span className="grow">{l.text}</span>
                      <span className="t12 muted">{formatDay(l.at)}</span>
                    </div>
                  ))}
                </div>
                <p className="help" style={{ margin: "6px 0 0" }}>
                  Older entries come from saved role grants. Removals are only listed until you leave this page.
                </p>
              </section>
            )}
          </div>
        )}

        {tab === "accounts" && mayAccounts && <AccountsTab c={c} onRoles={(q) => (setSearchQuery(q), router.replace(`/admin/people?q=${encodeURIComponent(q)}`), fetchStaffUsers(q))} />}

        {tab === "muted" && mayMute && <MutedTab c={c} isSiteAdmin={mayAccounts} />}
      </Body>

      {person && (
        <Sheet title={person.displayName || person.robloxUsername} onClose={() => setPersonId(null)}>
          <div style={{ display: "grid", gap: 20 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Avatar url={person.avatarUrl} name={person.displayName} size={48} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{person.displayName}</div>
                <div className="t12 muted">@{person.robloxUsername}</div>
              </div>
            </div>
            {mayRoles && person.roles && (
              <Section title="Roles" desc="Changes apply straight away.">
                {ALL_ROLES.map((role) => {
                  const on = person.roles.includes(role.id);
                  const locked = lockedFor(person, role.id);
                  return (
                    <Line key={role.id} label={role.name} help={locked ? "The root administrator keeps this role." : undefined}>
                      <Switch checked={on} disabled={locked} onChange={() => toggleRole(person.id, role.id, on)} label={`${role.name} for ${person.displayName}`} />
                    </Line>
                  );
                })}
              </Section>
            )}
            {mayMute && <MuteBox c={c} userId={person.id} />}
          </div>
        </Sheet>
      )}

      {ruleSections.length > 0 && (
        <SaveBar
          dirty={dirtyRules.length > 0}
          changed={dirtyRules.map((id) => c.SECTIONS[id].label)}
          saving={c.savingSection !== null}
          saved={c.savedSuccess}
          onSave={() => void c.saveMany(dirtyRules)}
          onDiscard={() => dirtyRules.forEach((id) => c.revertSection(id))}
        />
      )}
    </Screen>
  );
}

/** Mute status and the mute form for one person. */
function MuteBox({ c, userId }: { c: SiteConfig; userId: string }) {
  const active = c.moderations.find((m) => m.userId === userId);
  return (
    <Section title="Comments" desc={active ? undefined : "Muting stops this person from commenting and sending tips."}>
      {active ? (
        <div className="rows">
          <div className="r">
            <span className="grow">
              <span style={{ display: "block", fontWeight: 600 }}>Muted · {durationLabel(active.duration)}</span>
              <span className="t12 muted">
                {active.reason}
                {active.expiresAt ? ` · until ${formatDay(active.expiresAt)}` : ""}
                {active.moderatedBy ? ` · by ${active.moderatedBy}` : ""}
              </span>
            </span>
            <button type="button" className="btn sm" onClick={() => c.handleUnmuteUser(active.id)}>
              Unmute
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={c.handleMuteUser} style={{ display: "grid", gap: 10 }}>
          <div className="two">
            <Field label="For">
              <Select value={c.muteDuration} onChange={(e) => c.setMuteDuration(e.target.value as any)} className="select">
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reason">
              <input className="input" value={c.muteReason} onChange={(e) => c.setMuteReason(e.target.value)} placeholder="e.g. Toxicity" />
            </Field>
          </div>
          <div>
            <button type="submit" className="btn danger-solid">
              Mute
            </button>
          </div>
        </form>
      )}
    </Section>
  );
}

/* ---------------- Accounts ---------------- */

function AccountsTab({ c, onRoles }: { c: SiteConfig; onRoles: (q: string) => void }) {
  const creds = c.authMode === "credentials";
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <div className="today">
      {creds ? (
        <section className="todo">
          <h2>Add a staff account</h2>
          <form onSubmit={c.handleCreateEmployee} style={{ display: "flex", gap: 8 }}>
            <input className="input" style={{ flex: 1, minWidth: 0 }} value={c.newEmployeeUsername} onChange={(e) => c.setNewEmployeeUsername(e.target.value)} placeholder="Their Roblox username" required aria-label="Roblox username" />
            <button type="submit" className="btn primary" disabled={c.creatingEmployee || !c.newEmployeeUsername.trim()}>
              <UserPlus className="ic" />
              {c.creatingEmployee ? "Creating…" : "Create"}
            </button>
          </form>
          <p className="help" style={{ margin: "6px 0 0" }}>
            A password is made for them. Copy it and send it to them privately.
          </p>
          {c.createdEmployeeResult && (
            <div className="card" style={{ padding: 14, display: "grid", gap: 10, marginTop: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Avatar url={c.createdEmployeeResult.avatarUrl} name={c.createdEmployeeResult.displayName} />
                <span className="grow" style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontWeight: 600 }}>{c.createdEmployeeResult.displayName}</span>
                  <span className="t12 muted">@{c.createdEmployeeResult.username}</span>
                </span>
                <Pill tone="green">Ready</Pill>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="t12 muted">Password</span>
                <code style={{ fontWeight: 600, userSelect: "all", overflowWrap: "anywhere" }}>{c.createdEmployeeResult.password}</code>
                <button type="button" className="btn sm" style={{ marginLeft: "auto" }} onClick={() => c.handleCopyCredentials(c.createdEmployeeResult!.username, c.createdEmployeeResult!.password)}>
                  {c.copiedCredential ? <Check className="ic-sm" /> : <Copy className="ic-sm" />}
                  {c.copiedCredential ? "Copied" : "Copy sign-in details"}
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Everyone signs in with Roblox, so there are no passwords to manage. Find an account above to see its roles.
        </p>
      )}

      {c.resetPasswordResult && (
        <div className="notice warn" style={{ borderRadius: 8 }}>
          <Key className="ic-sm" />
          <span style={{ flex: 1, minWidth: 0 }}>
            New password for @{c.searchedUsers.find((u) => u.id === c.resetPasswordResult!.userId)?.robloxUsername ?? "the account"}: <code style={{ fontWeight: 600, userSelect: "all" }}>{c.resetPasswordResult.password}</code>
          </span>
          <button type="button" className="btn sm" onClick={() => navigator.clipboard.writeText(c.resetPasswordResult!.password).then(() => toast("Password copied."))}>
            <Copy className="ic-sm" /> Copy
          </button>
        </div>
      )}

      <section className="todo">
        <h2>
          Accounts {c.hasSearched && <span className="c">{c.searchedUsers.length}</span>}
        </h2>
        {c.searchingUsers ? (
          <p className="muted" style={{ margin: 0 }}>
            Searching…
          </p>
        ) : !c.hasSearched ? (
          <p className="muted" style={{ margin: 0 }}>
            Find an account by Roblox username or display name with the search above.
          </p>
        ) : c.searchedUsers.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No account matches “{c.userSearchQuery}”.
          </p>
        ) : (
          <div className="rows">
            {c.searchedUsers.map((emp) => (
              <div key={emp.id} className="r wrap">
                <Avatar url={emp.avatarUrl} name={emp.displayName} />
                <span className="grow" style={{ minWidth: 160 }}>
                  <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                    <span className="trunc" style={{ fontWeight: 600 }}>
                      {emp.displayName}
                    </span>
                    {creds && <Pill tone={emp.hasPassword ? "green" : "amber"}>{emp.hasPassword ? "Password set" : "No password"}</Pill>}
                  </span>
                  <span className="t12 muted trunc" style={{ display: "block" }}>
                    @{emp.robloxUsername} · {emp.roles?.length ? emp.roles.map((r: string) => ALL_ROLES.find((x) => x.id === r)?.short ?? r).join(", ") : "No roles"}
                  </span>
                </span>
                {creds ? (
                  renaming === emp.id ? (
                    <span style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                      <input className="input sm" style={{ width: 150 }} value={c.newUsernameInput} onChange={(e) => c.setNewUsernameInput(e.target.value)} placeholder="New username" aria-label="New username" autoFocus />
                      <button
                        type="button"
                        className="btn sm strong"
                        disabled={c.updatingUsername}
                        onClick={async () => {
                          await c.handleUpdateUsername(emp.id);
                          setRenaming(null);
                        }}
                      >
                        Save
                      </button>
                      <button type="button" className="btn sm ghost" onClick={() => setRenaming(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                      <button
                        type="button"
                        className="btn sm ghost"
                        onClick={() => {
                          setRenaming(emp.id);
                          c.setNewUsernameInput(emp.robloxUsername);
                        }}
                      >
                        <Pencil className="ic-sm" /> Username
                      </button>
                      <button type="button" className="btn sm" disabled={c.resettingPasswordUserId === emp.id} onClick={() => c.handleResetPassword(emp.id, emp.robloxUsername)}>
                        <Key className="ic-sm" /> New password
                      </button>
                      <button type="button" className="btn sm ghost danger" disabled={c.deletingUserId === emp.id} onClick={() => c.handleDeleteUser(emp.id, emp.robloxUsername)} aria-label={`Delete @${emp.robloxUsername}`}>
                        <Trash2 className="ic-sm" />
                      </button>
                    </span>
                  )
                ) : (
                  <button type="button" className="btn sm" style={{ marginLeft: "auto" }} onClick={() => onRoles(emp.robloxUsername)}>
                    Roles
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- Muted ---------------- */

function MutedTab({ c, isSiteAdmin }: { c: SiteConfig; isSiteAdmin: boolean }) {
  return (
    <div className="today">
      <section className="todo">
        <h2>Mute someone</h2>
        <form onSubmit={c.handleMuteUser} className="card" style={{ padding: 14, display: "grid", gap: 12 }}>
          <Field label="Who">
            <Select value={c.selectedUserToMute} onChange={(e) => c.setSelectedUserToMute(e.target.value)} className="select">
              <option value="">Pick a registered user</option>
              {c.registeredUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} (@{u.robloxUsername})
                </option>
              ))}
            </Select>
          </Field>
          <div className="two">
            <Field label="For">
              <Select value={c.muteDuration} onChange={(e) => c.setMuteDuration(e.target.value as any)} className="select">
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reason">
              <input className="input" value={c.muteReason} onChange={(e) => c.setMuteReason(e.target.value)} placeholder="e.g. Toxicity" />
            </Field>
          </div>
          <div>
            <button type="submit" className="btn danger-solid" disabled={!c.selectedUserToMute}>
              Mute
            </button>
          </div>
        </form>
      </section>

      <section className="todo">
        <h2>
          Muted now <span className="c">{c.moderations.length}</span>
        </h2>
        {c.moderations.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nobody is muted.
          </p>
        ) : (
          <div className="rows">
            {c.moderations.map((mod) => (
              <div key={mod.id} className="r">
                <span className="grow">
                  <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                    <span className="trunc" style={{ fontWeight: 600 }}>
                      {mod.displayName || mod.robloxUsername || "User"}
                    </span>
                    <span className="t12 muted">@{mod.robloxUsername}</span>
                    <Pill tone="red">{durationLabel(mod.duration)}</Pill>
                  </span>
                  <span className="t12 muted trunc" style={{ display: "block" }}>
                    {mod.reason} · by {mod.moderatedBy}
                    {mod.expiresAt ? ` · until ${formatDay(mod.expiresAt)}` : ""}
                  </span>
                </span>
                <button type="button" className="btn sm" onClick={() => c.handleUnmuteUser(mod.id)}>
                  Unmute
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {isSiteAdmin && (
        <div className="formcol" style={{ padding: 0 }}>
          <Section title="Automatic mutes" desc="Mute people who keep tripping the word filter.">
            <Line label="Mute repeat offenders" help="After enough blocked comments within five minutes, the person is muted.">
              <Switch checked={c.autoModEnabled} onChange={c.setAutoModEnabled} label="Automatic mutes" />
            </Line>
            {c.autoModEnabled && (
              <div className="two">
                <Field label="Blocked comments before a mute">
                  <input className="input" type="number" min={1} max={10} value={c.autoModThreshold} onChange={(e) => c.setAutoModThreshold(parseInt(e.target.value, 10) || 3)} />
                </Field>
                <Field label="Mute for">
                  <Select value={c.autoModMuteDuration} onChange={(e) => c.setAutoModMuteDuration(e.target.value as any)} className="select">
                    {DURATIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </Section>
          <Section title="Word filter" desc="Comments with any of these words are blocked and count towards automatic mutes.">
            <Field label="Blocked words" help="One per line.">
              <textarea className="textarea" rows={6} value={c.bannedWordsInput} onChange={(e) => c.setBannedWordsInput(e.target.value)} />
            </Field>
          </Section>
        </div>
      )}
    </div>
  );
}

export default function AdminPeoplePage() {
  return (
    <AdminAuthGuard requiredPermission={(r) => canAssignRoles(r) || canModerateUsers(r) || canConfigureSite(r)} featureTitle="People">
      <React.Suspense fallback={null}>
        <PeoplePage />
      </React.Suspense>
    </AdminAuthGuard>
  );
}
