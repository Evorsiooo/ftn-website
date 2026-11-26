"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { confirmDialog } from "@/components/gs/dialogs";
import { SETTINGS_PAGES } from "@/components/gs/admin-nav";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { Body, DT_CLASS, Field, Line, PageBar, Pill, SaveBar, Screen, Section, Seg, Switch } from "@/components/admin/ui";
import { ObsSettings } from "@/components/admin/schedule/obs-settings";
import { useSiteConfig, type SiteConfig } from "@/components/admin/settings/use-site-config";
import { canConfigureSite } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type Page = "site" | "access" | "radio" | "connections" | "ai";

/** The sections each settings page owns, so its save bar only saves what is on it. */
const PAGE_SECTIONS: Record<Page, string[]> = {
  site: ["donation", "links"],
  access: ["signin", "gates"],
  radio: ["stream", "station", "icecast", "rotation"],
  connections: ["art"],
  ai: [], // its own page (settings/ai), nothing to save here
};

function Connected({ on }: { on: boolean }) {
  return (
    <Pill tone={on ? "green" : "grey"} dot>
      {on ? "Connected" : "Not set up"}
    </Pill>
  );
}

export default function SettingsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const page: Page = pathname.endsWith("/connections") ? "connections" : pathname.endsWith("/radio") ? "radio" : pathname.endsWith("/access") ? "access" : "site";
  const meta = SETTINGS_PAGES.find((p) => p.key === page)!;
  const c = useSiteConfig();

  const mine = PAGE_SECTIONS[page];
  const dirtyHere = c.dirtySections.filter((id) => mine.includes(id));
  const labels = dirtyHere.map((id) => c.SECTIONS[id].label);

  return (
    <AdminAuthGuard requiredPermission={canConfigureSite} featureTitle="Settings">
      <Screen>
        <PageBar
          title={meta.title}
          crumb={{ href: "/admin/settings", label: "Settings" }}
          end={
            <select className="select sm show-m" value={meta.href} onChange={(e) => router.push(e.target.value)} aria-label="Settings page">
              {SETTINGS_PAGES.map((p) => (
                <option key={p.key} value={p.href}>
                  {p.title}
                </option>
              ))}
            </select>
          }
        />
        <Body>
          <div className="settings">
            <nav className="subnav hide-m" aria-label="Settings pages">
              {SETTINGS_PAGES.map((p) => (
                <Link key={p.key} href={p.href} className={cn(p.key === page && "on")} aria-current={p.key === page ? "page" : undefined}>
                  {p.title}
                  {c.dirtySections.some((id) => PAGE_SECTIONS[p.key as Page].includes(id)) && <span className="cnt">•</span>}
                </Link>
              ))}
            </nav>
            <div className="adm-scroll" style={{ height: "100%", minHeight: 0 }}>
              <div className="formcol">
                {!c.configLoaded ? (
                  <div className="empty">Loading settings…</div>
                ) : page === "site" ? (
                  <SitePage c={c} />
                ) : page === "access" ? (
                  <AccessPage c={c} />
                ) : page === "radio" ? (
                  <RadioPage c={c} />
                ) : (
                  <ConnectionsPage c={c} />
                )}
              </div>
            </div>
          </div>
        </Body>
        <SaveBar
          dirty={dirtyHere.length > 0}
          changed={labels}
          saving={c.savingSection !== null}
          saved={c.savedSuccess}
          onSave={() => void c.saveMany(dirtyHere)}
          onDiscard={async () => {
            if (await confirmDialog("Throw away your unsaved changes on this page?", { ok: "Discard", danger: true })) dirtyHere.forEach((id) => c.revertSection(id));
          }}
        />
      </Screen>
    </AdminAuthGuard>
  );
}

/* ---------------- Site ---------------- */

function SitePage({ c }: { c: SiteConfig }) {
  return (
    <>
      <Section title="Donation banner">
        <Line label="Show the “FTN needs your help!” banner on the homepage" help={c.donationBannerEnabled ? "Visitors see the appeal." : "Hidden from visitors."}>
          <Switch checked={c.donationBannerEnabled} onChange={c.setDonationBannerEnabled} label="Show donation banner" />
        </Line>
      </Section>
      <Section title="Links" desc="The Discord button in the navigation bar and the links in the footer.">
        <Field label="Discord button" help="The Discord button next to FTN+ in the navigation bar opens this.">
          <input className="input" value={c.discordUrl} onChange={(e) => c.setDiscordUrl(e.target.value)} placeholder="https://discord.gg/ftn" />
        </Field>
        <Field label={`Footer links (${c.socialLinks.length})`}>
          {c.socialLinks.length > 0 && (
            <div className="rows">
              {c.socialLinks.map((link) => (
                <div key={link.id} className="r">
                  <span className="grow">
                    <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                      {link.name}
                    </span>
                    <span className="t12 muted trunc" style={{ display: "block" }}>
                      {link.url}
                    </span>
                  </span>
                  <button type="button" className="btn sm ghost danger" onClick={() => c.handleRemoveSocialLink(link.id)} aria-label={`Remove ${link.name}`}>
                    <Trash2 className="ic-sm" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={c.handleAddSocialLink} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr) auto", gap: 8 }} className="links-add">
            <input className="input" value={c.newSocialName} onChange={(e) => c.setNewSocialName(e.target.value)} placeholder="Name, e.g. Bluesky" aria-label="Link name" />
            <input className="input" value={c.newSocialUrl} onChange={(e) => c.setNewSocialUrl(e.target.value)} placeholder="https://…" aria-label="Link address" />
            <button type="submit" className="btn" disabled={!c.newSocialName.trim() || !c.newSocialUrl.trim()}>
              <Plus className="ic" /> Add
            </button>
          </form>
        </Field>
      </Section>
    </>
  );
}

/* ---------------- Sign-in ---------------- */

function AccessPage({ c }: { c: SiteConfig }) {
  const gate = (value: "public" | "members_only", onChange: (v: "public" | "members_only") => void, label: string) => (
    <Seg
      value={value}
      onChange={onChange}
      options={[
        { value: "public", label: "Everyone" },
        { value: "members_only", label: "Signed-in only" },
      ]}
      label={label}
    />
  );
  return (
    <>
      <Section title="Sign-in" desc="How visitors and staff create accounts and log in.">
        <Field
          label="Sign-in method"
          help={c.authMode === "roblox" ? "Everyone signs in with their Roblox account." : "Staff sign in with a username and password that a site administrator creates in People › Accounts."}
        >
          <Seg
            value={c.authMode}
            onChange={(m) => {
              c.setAuthMode(m);
              if (m === "credentials") c.setAllowSignIn(false);
            }}
            options={[
              { value: "roblox", label: "Roblox" },
              { value: "credentials", label: "Username and password" },
            ]}
            label="Sign-in method"
          />
        </Field>
        <Line
          label="New visitors can create an account"
          help={
            c.authMode === "credentials"
              ? "Always off with usernames and passwords: only site administrators add accounts."
              : c.allowSignIn
                ? "Anyone can register with Roblox."
                : "Only people who already have an account can sign in."
          }
        >
          <Switch checked={c.allowSignIn && c.authMode !== "credentials"} disabled={c.authMode === "credentials"} onChange={c.setAllowSignIn} label="Account creation" />
        </Line>
      </Section>
      <Section title="Who can see what">
        <Line label="FTN+" help={c.ftnPlusAccess === "public" ? "Anyone can browse and watch." : "Visitors must sign in to open FTN+."}>
          {gate(c.ftnPlusAccess, c.setFtnPlusAccess, "FTN+ access")}
        </Line>
        <Line label="Tipline" help={c.tiplineAccess === "public" ? "Anyone can send a tip, anonymously or with their Roblox name." : "Visitors must sign in to send a tip."}>
          {gate(c.tiplineAccess, c.setTiplineAccess, "Tipline access")}
        </Line>
        <Line
          label="Radio problem reports"
          help={
            c.reportsAccess === "public"
              ? "Anyone can report a song or a bug from the radio player. Each report says whether they were signed in."
              : c.reportsAccess === "members_only"
                ? "Listeners must sign in to report a problem."
                : "The report button is hidden."
          }
        >
          <Seg
            value={c.reportsAccess}
            onChange={c.setReportsAccess}
            options={[
              { value: "public", label: "Everyone" },
              { value: "members_only", label: "Signed-in only" },
              { value: "off", label: "Off" },
            ]}
            label="Radio problem reports"
          />
        </Line>
      </Section>
      <Section title="Staff accounts">
        <p className="help" style={{ margin: 0 }}>
          Accounts, passwords and roles are on the{" "}
          <Link href="/admin/people?tab=accounts" className="link">
            People
          </Link>{" "}
          page.
        </p>
      </Section>
    </>
  );
}

/* ---------------- Radio ---------------- */

type Usage = { bytes: number; capBytes: number; freeBytes: number; blocked: boolean };
const gb = (b: number) => `${(b / 1e9).toFixed(b < 10e9 ? 2 : 0)} GB`;

function RadioPage({ c }: { c: SiteConfig }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    fetch("/api/admin/radio/studio")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => d?.usage && setUsage(d.usage))
      .catch(() => {});
  }, []);
  const set = (patch: Partial<SiteConfig["radioPublic"]>) => c.setRadioPublic({ ...c.radioPublic, ...patch });
  return (
    <>
      <Section title="Stream" desc="Where the radio's audio and its now-playing data come from.">
        <Line label="Radio on FTN+" help={c.webradioToggle ? "The radio player is live for visitors." : "The radio player is switched off."}>
          <Switch checked={c.webradioToggle} onChange={c.setWebradioToggle} label="Radio on FTN+" />
        </Line>
        <div className="two">
          <Field label="Stream address" help="The .mp3 or .aac stream.">
            <input className="input" value={c.streamUrlInput} onChange={(e) => c.setStreamUrlInput(e.target.value)} placeholder="https://icecast.ftnmedia.org/live.mp3" />
          </Field>
          <Field label="Now-playing address" help="The stream server's status page (JSON).">
            <input className="input" value={c.statusJsonInput} onChange={(e) => c.setStatusJsonInput(e.target.value)} placeholder="https://icecast.ftnmedia.org/status-json.xsl" />
          </Field>
        </div>
      </Section>
      <Section title="Station" desc="What listeners see on the radio page.">
        <Line
          label="Show the song that is playing"
          help={
            c.radioPublic.songDetection ? "The radio page shows the song the stream reports, and listeners can vote on it." : "Only the show and station are shown: no song, no song art, no votes."
          }
        >
          <Switch checked={c.radioPublic.songDetection} onChange={(v) => set({ songDetection: v })} label="Song detection" />
        </Line>
        <div className="two">
          <Field label="Station name">
            <input className="input" value={c.radioPublic.stationName} onChange={(e) => set({ stationName: e.target.value })} />
          </Field>
          <Field label="Default cover" help="Shown when no show or song art is found.">
            <input className="input" value={c.radioPublic.defaultArtUrl} onChange={(e) => set({ defaultArtUrl: e.target.value })} placeholder="https://…" />
          </Field>
        </div>
      </Section>
      <Section title="Discord bot" desc="Lets servers play the radio in a voice channel.">
        <div className="two">
          <Field label="Invite link">
            <input className="input" value={c.radioPublic.discordBotLink} onChange={(e) => set({ discordBotLink: e.target.value })} placeholder="https://discord.com/oauth2/authorize?client_id=…" />
          </Field>
          <Field label="Setup command">
            <input className="input" value={c.radioPublic.discordBotCommand} onChange={(e) => set({ discordBotCommand: e.target.value })} placeholder="/setup" />
          </Field>
        </div>
      </Section>
      <StreamServerSections c={c} />
      <Section title="Broadcasting from OBS" id="obs" desc="For shows sent from OBS instead of the Studio. Changes here save straight away.">
        <ObsSettings />
      </Section>
      <Section title="Voice usage this month" desc="Talking in the Studio and calls use Cloudflare's voice service.">
        {usage ? (
          <div style={{ display: "grid", gap: 6 }}>
            <div className={usage.blocked ? "meter low" : "meter"}>
              <i style={{ width: `${Math.min(100, (usage.bytes / usage.capBytes) * 100)}%` }} />
            </div>
            <div className="help">
              About {gb(usage.bytes)} of the {gb(usage.capBytes)} cap (Cloudflare&apos;s free allowance is {gb(usage.freeBytes)}).{" "}
              {usage.blocked ? "Voice is off until next month." : "Voice stops by itself at the cap, so it never costs anything."}
            </div>
          </div>
        ) : (
          <p className="help" style={{ margin: 0 }}>
            Not available right now.
          </p>
        )}
      </Section>
    </>
  );
}

/* ---------------- Integrations ---------------- */

function StreamServerSections({ c }: { c: SiteConfig }) {
  const s = c.radioSecure;
  const set = (patch: Partial<SiteConfig["radioSecure"]>) => c.setRadioSecure({ ...s, ...patch });
  return (
    <>
      <Section
        title="Icecast"
        aside={<Connected on={!!(s.icecastAdminUrl && s.icecastPassword)} />}
        desc="Optional. Lets the site read live listener counts and song details from the stream server. Stored encrypted, never sent to visitors."
      >
        <div className="two">
          <Field label="Admin address">
            <input className="input" value={s.icecastAdminUrl} onChange={(e) => set({ icecastAdminUrl: e.target.value })} placeholder="http://127.0.0.1:8000" />
          </Field>
          <Field label="Mount point">
            <input className="input" value={s.icecastMount} onChange={(e) => set({ icecastMount: e.target.value })} placeholder="/autodj" />
          </Field>
          <Field label="Admin username">
            <input className="input" value={s.icecastUsername} onChange={(e) => set({ icecastUsername: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Admin password">
            <input className="input" type="password" value={s.icecastPassword} onChange={(e) => set({ icecastPassword: e.target.value })} autoComplete="new-password" />
          </Field>
        </div>
      </Section>
      <Section
        title="OBS password rotation"
        aside={<Connected on={!!(s.rotationEndpointUrl && s.rotationEndpointToken)} />}
        desc={
          <>
            A small service on the radio server changes the OBS password. Automatic changes are checked every hour. The current password is in{" "}
            <a href="#obs" className="link">
              Broadcasting from OBS
            </a>{" "}
            above.
          </>
        }
      >
        <div className="two">
          <Field label="Service address">
            <input className="input" value={s.rotationEndpointUrl} onChange={(e) => set({ rotationEndpointUrl: e.target.value })} placeholder="https://euno.cc/rotate" />
          </Field>
          <Field label="Service key">
            <input className="input" type="password" value={s.rotationEndpointToken} onChange={(e) => set({ rotationEndpointToken: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Change it automatically">
            <Select value={s.rotationFrequencyHours} onChange={(e) => set({ rotationFrequencyHours: Number(e.target.value) })} className="select">
              <option value={0}>Never</option>
              <option value={12}>Every 12 hours</option>
              <option value={24}>Every 24 hours</option>
              <option value={48}>Every 48 hours</option>
              <option value={72}>Every 72 hours</option>
            </Select>
          </Field>
          <Field label="At (UTC)" help="For every 24 hours or more.">
            <DateTimeInput type="time" value={s.rotationTimeUtc} onChange={(e) => set({ rotationTimeUtc: e.target.value })} className={DT_CLASS} />
          </Field>
        </div>
        <Field label="Discord webhook for notices" help="Posts in Discord each time the password changes.">
          <input
            className="input"
            type="password"
            value={s.discordWebhookUrl}
            onChange={(e) => set({ discordWebhookUrl: e.target.value })}
            placeholder="https://discord.com/api/webhooks/…"
            autoComplete="new-password"
          />
        </Field>
      </Section>
    </>
  );
}

function ConnectionsPage({ c }: { c: SiteConfig }) {
  const s = c.radioSecure;
  const set = (patch: Partial<SiteConfig["radioSecure"]>) => c.setRadioSecure({ ...s, ...patch });
  return (
    <>
      <Section title="YouTube and Twitch" desc="The channels FTN+ shows and their sync live with the rest of the FTN+ content.">
        <Line label="Channels and sync" help="Add or remove YouTube channels and Twitch streamers, and sync videos now.">
          <Link href="/admin/plus" className="btn sm">
            Open FTN+ content
          </Link>
        </Line>
      </Section>
      <Section title="Album art" aside={<Connected on={!!(s.lastFmApiKey || s.fanartTvApiKey)} />} desc="Keys and lookup order for finding the cover of the song on air.">
        <div className="two">
          <Field label="Last.fm key">
            <input className="input" type="password" value={s.lastFmApiKey} onChange={(e) => set({ lastFmApiKey: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Fanart.tv key">
            <input className="input" type="password" value={s.fanartTvApiKey} onChange={(e) => set({ fanartTvApiKey: e.target.value })} autoComplete="new-password" />
          </Field>
        </div>
        <div className="three">
          {[0, 1, 2].map((i) => (
            <Field key={i} label={i === 0 ? "Look in first" : i === 1 ? "Then" : "Then"}>
              <Select
                value={s.artPriority[i] || ""}
                onChange={(e) => {
                  const next = [...s.artPriority];
                  next[i] = e.target.value;
                  set({ artPriority: next.filter(Boolean) });
                }}
                className="select"
              >
                <option value="lastfm">Last.fm</option>
                <option value="itunes">iTunes</option>
                <option value="fanart">Fanart.tv</option>
              </Select>
            </Field>
          ))}
        </div>
      </Section>
    </>
  );
}
