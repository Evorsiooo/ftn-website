"use client";
import { Select } from "@/components/ui/select";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_PAGES } from "@/components/gs/admin-nav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader } from "@/components/gs/admin-header";
import { AdminDrawer } from "@/components/gs/admin-drawer";
import { AdminRow, AdminSaveBar, AdminSection, AdminSegmented, AdminSwitch } from "@/components/gs/admin-form";
import { canConfigureSite } from "@/lib/rbac";
import {
  Radio,
  Check,
  Shield,
  Video,
  Plus,
  Trash2,
  RefreshCw,
  Lock,
  Globe,
  Sliders,
  ArrowLeft,
  Share2,
  UserX,
  Edit2,
  AlertTriangle,
  Copy,
  Key,
  UserPlus,
  UserCheck,
  Search,
  Loader2,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  ListVideo,
  Film,
  Eye,
  EyeOff,
} from "lucide-react";

interface PlaylistVideo {
  youtubeId: string;
  title: string;
  thumbnailUrl?: string;
  channelTitle?: string;
}

interface CustomSwimlane {
  id: string;
  title: string;
  type?: "filter" | "playlist";
  channel?: string;
  channelIds?: string[];
  regexPattern?: string;
  sortBy: "recent" | "trending" | "curated";
  playlistVideos?: PlaylistVideo[];
}

interface SocialLink {
  id: string;
  name: string;
  url: string;
}

export default function SiteSettingsPage() {

  // Webradio
  const [streamUrlInput, setStreamUrlInput] = useState("https://icecast.ftnmedia.org/live.mp3");
  const [statusJsonInput, setStatusJsonInput] = useState("https://icecast.ftnmedia.org/status-json.xsl");
  const [webradioToggle, setWebradioToggle] = useState(true);
  const [radioPublic, setRadioPublic] = useState({
    stationName: "FTN Radio",
    discordBotLink: "",
    discordBotCommand: "/setup",
    defaultArtUrl: "",
  });
  const [radioSecure, setRadioSecure] = useState({
    icecastAdminUrl: "",
    icecastUsername: "admin",
    icecastPassword: "",
    icecastMount: "",
    lastFmApiKey: "",
    fanartTvApiKey: "",
    artPriority: ["lastfm", "itunes", "fanart"] as string[],
    discordWebhookUrl: "",
    rotationEndpointUrl: "",
    rotationEndpointToken: "",
    rotationFrequencyHours: 0,
    rotationTimeUtc: "00:00",
  });

  // Access & Authentication Mode
  const [allowSignIn, setAllowSignIn] = useState(true);
  const [authMode, setAuthMode] = useState<"roblox" | "credentials">("roblox");
  const [ftnPlusAccess, setFtnPlusAccess] = useState<"public" | "members_only">("public");
  const [tiplineAccess, setTiplineAccess] = useState<"public" | "members_only">("public");

  // User Accounts & Password Management
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const [newEmployeeUsername, setNewEmployeeUsername] = useState("");
  const [creatingEmployee, setCreatingEmployee] = useState(false);
  const [createdEmployeeResult, setCreatedEmployeeResult] = useState<{
    username: string;
    displayName: string;
    avatarUrl?: string;
    password: string;
  } | null>(null);
  const [editingUsernameUserId, setEditingUsernameUserId] = useState<string | null>(null);
  const [newUsernameInput, setNewUsernameInput] = useState("");
  const [updatingUsername, setUpdatingUsername] = useState(false);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<string | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<{
    userId: string;
    password: string;
  } | null>(null);
  const [copiedCredential, setCopiedCredential] = useState(false);

  // Discord & Social Links
  const [discordUrl, setDiscordUrl] = useState("https://discord.gg/ftn");
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([
    { id: "sl-discord", name: "Discord Server", url: "https://discord.gg/ftn" },
    { id: "sl-roblox", name: "Roblox Group", url: "https://www.roblox.com" },
    { id: "sl-youtube", name: "YouTube Channel", url: "https://www.youtube.com" },
  ]);
  const [newSocialName, setNewSocialName] = useState("");
  const [newSocialUrl, setNewSocialUrl] = useState("");

  // Profanity
  const [bannedWordsInput, setBannedWordsInput] = useState("fuck\nshit\nbitch\nasshole\ncunt\ndick\npussy");

  // Tab Navigation State
  const pathname = usePathname();
  const activeTab: "site" | "radio" | "connections" | "access" | "moderation" | "plus" = pathname.endsWith("/connections") ? "connections" : pathname.endsWith("/radio") ? "radio" : pathname.endsWith("/access") ? "access" : pathname.endsWith("/moderation") ? "moderation" : pathname.endsWith("/plus") ? "plus" : "site";

  // YouTube Channels & Video Management
  const [youtubeChannels, setYoutubeChannels] = useState<string[]>([]);
  const [newChannelInput, setNewChannelInput] = useState("");
  const [twitchChannels, setTwitchChannels] = useState<string[]>([]);
  const [newTwitchInput, setNewTwitchInput] = useState("");
  const [hiddenFeaturedChannels, setHiddenFeaturedChannels] = useState<string[]>([]);
  const [hiddenTrendingChannels, setHiddenTrendingChannels] = useState<string[]>([]);
  const [hiddenVideoIds, setHiddenVideoIds] = useState<string[]>([]);
  const [ingestedVideos, setIngestedVideos] = useState<any[]>([]);
  const [videoSearchQuery, setVideoSearchQuery] = useState("");
  const [videoFilter, setVideoFilter] = useState<"all" | "shown" | "hidden">("all");
  const [newSwimlaneOpen, setNewSwimlaneOpen] = useState(false);
  const swimlaneCount = useRef(0);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [videosLoaded, setVideosLoaded] = useState(false);
  const [visibleVideoCount, setVisibleVideoCount] = useState(25);

  // Custom Swimlanes
  const [swimlanes, setSwimlanes] = useState<CustomSwimlane[]>([]);
  useEffect(() => {
    if (swimlanes.length > swimlaneCount.current) setNewSwimlaneOpen(false);
    swimlaneCount.current = swimlanes.length;
  }, [swimlanes.length]);
  const [newSwimlaneType, setNewSwimlaneType] = useState<"filter" | "playlist">("filter");
  const [newSwimlaneTitle, setNewSwimlaneTitle] = useState("");
  const [newSwimlaneChannel, setNewSwimlaneChannel] = useState("");
  const [newSwimlaneRegex, setNewSwimlaneRegex] = useState("");
  const [newSwimlaneSort, setNewSwimlaneSort] = useState<"recent" | "trending" | "curated">("recent");
  const [newPlaylistVideos, setNewPlaylistVideos] = useState<PlaylistVideo[]>([]);
  const [newPlaylistVideoUrl, setNewPlaylistVideoUrl] = useState("");
  const [addingPlaylistVideo, setAddingPlaylistVideo] = useState(false);

  const [editingSwimlane, setEditingSwimlane] = useState<CustomSwimlane | null>(null);
  const [editingPlaylistVideoUrl, setEditingPlaylistVideoUrl] = useState("");
  const [addingEditPlaylistVideo, setAddingEditPlaylistVideo] = useState(false);

  // User Moderation & Auto-Mod
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);
  const [moderations, setModerations] = useState<any[]>([]);
  const [selectedUserToMute, setSelectedUserToMute] = useState("");
  const [muteDuration, setMuteDuration] = useState<"24h" | "1w" | "1m" | "indefinite">("24h");
  const [muteReason, setMuteReason] = useState("");
  const [autoModEnabled, setAutoModEnabled] = useState(true);
  const [donationBannerEnabled, setDonationBannerEnabled] = useState(true);
  const [autoModThreshold, setAutoModThreshold] = useState(3);
  const [autoModMuteDuration, setAutoModMuteDuration] = useState<"24h" | "1w" | "1m" | "indefinite">("24h");

  // Statuses
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSyncingVideos, setIsSyncingVideos] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [purgingVideos, setPurgingVideos] = useState(false);

  const payloadJson = JSON.stringify({
    streamUrlInput, statusJsonInput, webradioToggle, allowSignIn, authMode, ftnPlusAccess, tiplineAccess, discordUrl, socialLinks,
    bannedWordsInput, youtubeChannels, twitchChannels, hiddenFeaturedChannels, hiddenTrendingChannels, swimlanes, hiddenVideoIds, autoModEnabled,
    donationBannerEnabled, autoModThreshold, autoModMuteDuration, radioPublic, radioSecure,
  });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [baseline, setBaseline] = useState<string | null>(null);
  useEffect(() => {
    if (configLoaded && baseline === null) setBaseline(payloadJson);
  }, [configLoaded, baseline, payloadJson]);
  const dirty = baseline !== null && payloadJson !== baseline;
  // Each section saves on its own. `keys` are payload fields; `pub` and `sec` are fields inside the radio objects.
  const SECTIONS: Record<string, { label: string; keys?: string[]; pub?: string[]; sec?: string[] }> = {
    donation: { label: "Donation banner", keys: ["donationBannerEnabled"] },
    links: { label: "Links", keys: ["discordUrl", "socialLinks"] },
    stream: { label: "Webradio stream", keys: ["streamUrlInput", "statusJsonInput", "webradioToggle"] },
    station: { label: "Station & Discord bot", pub: ["stationName", "discordBotLink", "discordBotCommand"] },
    icecast: { label: "Icecast", sec: ["icecastAdminUrl", "icecastUsername", "icecastPassword", "icecastMount"] },
    rotation: { label: "Password rotation", sec: ["rotationEndpointUrl", "rotationEndpointToken", "rotationFrequencyHours", "rotationTimeUtc", "discordWebhookUrl"] },
    art: { label: "Album art", pub: ["defaultArtUrl"], sec: ["lastFmApiKey", "fanartTvApiKey", "artPriority"] },
    signin: { label: "Sign-in", keys: ["allowSignIn", "authMode"] },
    gates: { label: "Access gates", keys: ["ftnPlusAccess", "tiplineAccess"] },
    automod: { label: "Auto-moderation", keys: ["autoModEnabled", "autoModThreshold", "autoModMuteDuration"] },
    profanity: { label: "Profanity filter", keys: ["bannedWordsInput"] },
    channels: { label: "YouTube channels", keys: ["youtubeChannels", "hiddenFeaturedChannels", "hiddenTrendingChannels"] },
    twitch: { label: "Twitch channels", keys: ["twitchChannels"] },
    catalog: { label: "Video catalog", keys: ["hiddenVideoIds"] },
    swimlanes: { label: "Swimlanes", keys: ["swimlanes"] },
  };
  const API_KEY: Record<string, string> = { streamUrlInput: "streamUrl", statusJsonInput: "statusJson", webradioToggle: "webradioEnabled", bannedWordsInput: "bannedWords", swimlanes: "customSwimlanes" };
  const setters: Record<string, (v: any) => void> = {
    donationBannerEnabled: setDonationBannerEnabled, discordUrl: setDiscordUrl, socialLinks: setSocialLinks, streamUrlInput: setStreamUrlInput,
    statusJsonInput: setStatusJsonInput, webradioToggle: setWebradioToggle, allowSignIn: setAllowSignIn, authMode: setAuthMode,
    ftnPlusAccess: setFtnPlusAccess, tiplineAccess: setTiplineAccess, autoModEnabled: setAutoModEnabled, autoModThreshold: setAutoModThreshold,
    autoModMuteDuration: setAutoModMuteDuration, bannedWordsInput: setBannedWordsInput, youtubeChannels: setYoutubeChannels, twitchChannels: setTwitchChannels,
    hiddenFeaturedChannels: setHiddenFeaturedChannels, hiddenTrendingChannels: setHiddenTrendingChannels, hiddenVideoIds: setHiddenVideoIds, swimlanes: setSwimlanes,
  };
  const dirtySections: string[] = (() => {
    if (baseline === null) return [];
    const was = JSON.parse(baseline) as Record<string, any>;
    const now = JSON.parse(payloadJson) as Record<string, any>;
    const differs = (x: unknown, y: unknown) => JSON.stringify(x) !== JSON.stringify(y);
    return Object.keys(SECTIONS).filter((id) => {
      const sec = SECTIONS[id];
      return (
        (sec.keys ?? []).some((k) => differs(now[k], was[k])) ||
        (sec.pub ?? []).some((k) => differs(now.radioPublic?.[k], was.radioPublic?.[k])) ||
        (sec.sec ?? []).some((k) => differs(now.radioSecure?.[k], was.radioSecure?.[k]))
      );
    });
  })();
  const changedLabels = dirtySections.map((id) => SECTIONS[id].label);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  const saveSection = async (id: string) => {
    if (baseline === null) return;
    const sec = SECTIONS[id];
    const now = JSON.parse(payloadJson) as Record<string, any>;
    setSavingSection(id);
    try {
      const config: Record<string, unknown> = {};
      for (const k of sec.keys ?? []) config[API_KEY[k] ?? k] = k === "autoModThreshold" ? Number(now[k]) : k === "streamUrlInput" || k === "statusJsonInput" || k === "discordUrl" ? String(now[k]).trim() : now[k];
      if (Object.keys(config).length > 0) {
        const res = await fetch("/api/radio/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as any).error || "Save failed");
      }
      if (sec.pub || sec.sec) {
        const pick = (obj: Record<string, any> | undefined, ks?: string[]) => Object.fromEntries((ks ?? []).map((k) => [k, obj?.[k]]));
        const res = await fetch("/api/admin/radio/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public: pick(now.radioPublic, sec.pub), secure: pick(now.radioSecure, sec.sec) }),
        });
        if (!res.ok) throw new Error("Save failed");
      }
      const next = JSON.parse(baseline) as Record<string, any>;
      for (const k of sec.keys ?? []) next[k] = now[k];
      for (const k of sec.pub ?? []) next.radioPublic = { ...next.radioPublic, [k]: now.radioPublic?.[k] };
      for (const k of sec.sec ?? []) next.radioSecure = { ...next.radioSecure, [k]: now.radioSecure?.[k] };
      setBaseline(JSON.stringify(next));
      toast(`${sec.label} saved.`);
    } catch (err: any) {
      toast(err.message || "Could not save this section.");
    } finally {
      setSavingSection(null);
    }
  };

  const revertSection = (id: string) => {
    if (baseline === null) return;
    const sec = SECTIONS[id];
    const was = JSON.parse(baseline) as Record<string, any>;
    for (const k of sec.keys ?? []) setters[k]?.(was[k]);
    if (sec.pub) setRadioPublic((p) => ({ ...p, ...Object.fromEntries(sec.pub!.map((k) => [k, was.radioPublic?.[k]])) }));
    if (sec.sec) setRadioSecure((p) => ({ ...p, ...Object.fromEntries(sec.sec!.map((k) => [k, was.radioSecure?.[k]])) }));
  };

  const connectionBadge = (connected: boolean) => (
    <div className="flex items-center gap-2 text-sm font-bold">
      <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-neutral-400"}`} />
      {connected ? "Connected" : "Not set up yet"}
    </div>
  );

  const sectionFooter = (id: string) =>
    dirtySections.includes(id) ? (
      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <span className="text-sm text-neutral-500">Unsaved changes in this section</span>
        <span className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => revertSection(id)} className="cursor-pointer">Revert</Button>
          <Button type="button" size="sm" disabled={savingSection === id} onClick={() => saveSection(id)} className="cursor-pointer bg-brand font-bold text-brand-ink hover:bg-brand-hover">
            {savingSection === id ? "Saving…" : `Save ${SECTIONS[id].label.toLowerCase()}`}
          </Button>
        </span>
      </div>
    ) : null;

  useEffect(() => {
    // 1. Fetch site config
    const configDone = fetch("/api/radio/config")
      .then((res) => res.json())
      .then((data: any) => {
        if (data) {
          if (data.streamUrl) setStreamUrlInput(data.streamUrl);
          if (data.statusJson) setStatusJsonInput(data.statusJson);
          if (data.webradioEnabled !== undefined) setWebradioToggle(data.webradioEnabled);
          if (data.allowSignIn !== undefined) setAllowSignIn(data.allowSignIn);
          if (data.authMode) setAuthMode(data.authMode);
          if (data.ftnPlusAccess) setFtnPlusAccess(data.ftnPlusAccess);
          if (data.tiplineAccess) setTiplineAccess(data.tiplineAccess);
          if (data.discordUrl) setDiscordUrl(data.discordUrl);
          if (data.bannedWords !== undefined) setBannedWordsInput(data.bannedWords);
          if (Array.isArray(data.socialLinks)) setSocialLinks(data.socialLinks);
          if (Array.isArray(data.youtubeChannels)) setYoutubeChannels(data.youtubeChannels);
          if (Array.isArray(data.twitchChannels)) setTwitchChannels(data.twitchChannels);
          if (Array.isArray(data.hiddenFeaturedChannels)) setHiddenFeaturedChannels(data.hiddenFeaturedChannels);
          if (Array.isArray(data.hiddenTrendingChannels)) setHiddenTrendingChannels(data.hiddenTrendingChannels);
          if (Array.isArray(data.customSwimlanes)) setSwimlanes(data.customSwimlanes);
          if (Array.isArray(data.hiddenVideoIds)) setHiddenVideoIds(data.hiddenVideoIds);
          if (data.autoModEnabled !== undefined) setAutoModEnabled(data.autoModEnabled);
          if (data.donationBannerEnabled !== undefined) setDonationBannerEnabled(data.donationBannerEnabled);
          if (data.autoModThreshold !== undefined) setAutoModThreshold(data.autoModThreshold);
          if (data.autoModMuteDuration) setAutoModMuteDuration(data.autoModMuteDuration);
        }
      })
      .catch(() => {});

    // 1b. Fetch radio settings (site administrators only)
    const radioDone = fetch("/api/admin/radio/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: any) => {
        if (data?.public) setRadioPublic((prev) => ({ ...prev, ...data.public }));
        if (data?.secure) setRadioSecure((prev) => ({ ...prev, ...data.secure }));
      })
      .catch(() => {});

    Promise.all([configDone, radioDone]).then(() => setTimeout(() => setConfigLoaded(true), 0));

    // 2. Fetch registered users for moderation dropdown
    fetch("/api/admin/users")
      .then((res) => res.json())
      .then((data: any) => {
        if (data && Array.isArray(data.users)) {
          setRegisteredUsers(data.users);
        }
      })
      .catch(() => {});

    // 3. Fetch active moderations
    fetchModerations();

  }, []);

  const fetchVideosCatalog = async (force = false) => {
    if ((videosLoaded && !force) || loadingVideos) return;
    setLoadingVideos(true);
    try {
      const res = await fetch("/api/plus/videos?fresh=1");
      const data = (await res.json()) as any;
      if (data && Array.isArray(data.videos)) {
        setIngestedVideos(data.videos);
        setVideosLoaded(true);
      }
    } catch (err) {
      console.error("Failed to load video catalog:", err);
    } finally {
      setLoadingVideos(false);
    }
  };

  // Lazy-load videos on demand when plus tab is opened
  useEffect(() => {
    if (activeTab === "plus" && !videosLoaded) {
      fetchVideosCatalog();
    }
  }, [activeTab, videosLoaded]);

  const handleSearchUsers = (query: string = userSearchQuery) => {
    if (!query.trim()) {
      setSearchedUsers([]);
      setHasSearched(false);
      return;
    }
    setSearchingUsers(true);
    setHasSearched(true);
    fetch(`/api/admin/employees?search=${encodeURIComponent(query.trim())}`)
      .then((res) => res.json())
      .then((data: any) => {
        if (data && Array.isArray(data.employees)) {
          setSearchedUsers(data.employees);
        } else {
          setSearchedUsers([]);
        }
      })
      .catch(() => setSearchedUsers([]))
      .finally(() => setSearchingUsers(false));
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeUsername.trim()) return;

    setCreatingEmployee(true);
    setCreatedEmployeeResult(null);

    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          username: newEmployeeUsername.trim(),
        }),
      });

      const data = (await res.json()) as any;
      if (res.ok && data.success) {
        setCreatedEmployeeResult({
          username: data.user.robloxUsername,
          displayName: data.user.displayName,
          avatarUrl: data.user.avatarUrl,
          password: data.password,
        });
        const createdName = newEmployeeUsername.trim();
        setNewEmployeeUsername("");
        setUserSearchQuery(createdName);
        handleSearchUsers(createdName);
      } else {
        toast(`Error creating employee: ${data.error || "Failed"}`);
      }
    } catch {
      toast("Network error while creating employee account.");
    } finally {
      setCreatingEmployee(false);
    }
  };

  const handleResetPassword = async (userId: string, username: string) => {
    if (!await confirmDialog(`Generate a new password for @${username}?`)) return;

    setResettingPasswordUserId(userId);
    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_password", userId }),
      });

      const data = (await res.json()) as any;
      if (res.ok && data.success) {
        setResetPasswordResult({ userId, password: data.password });
        setSearchedUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, hasPassword: true } : u))
        );
      } else {
        toast(`Failed to reset password: ${data.error || "Error"}`);
      }
    } catch {
      toast("Error resetting password.");
    } finally {
      setResettingPasswordUserId(null);
    }
  };

  const handleUpdateUsername = async (userId: string) => {
    if (!newUsernameInput.trim()) return;

    setUpdatingUsername(true);
    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_username",
          userId,
          newUsername: newUsernameInput.trim(),
        }),
      });

      const data = (await res.json()) as any;
      if (res.ok && data.success) {
        setEditingUsernameUserId(null);
        setNewUsernameInput("");
        setSearchedUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  robloxUsername: data.profile.robloxUsername,
                  displayName: data.profile.displayName,
                  avatarUrl: data.profile.avatarUrl,
                }
              : u
          )
        );
      } else {
        toast(`Failed to update username: ${data.error || "Error"}`);
      }
    } catch {
      toast("Error updating username.");
    } finally {
      setUpdatingUsername(false);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!await confirmDialog(`Are you sure you want to permanently delete the user account @${username}?`)) return;

    setDeletingUserId(userId);
    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_user", userId }),
      });

      const data = (await res.json()) as any;
      if (res.ok && data.success) {
        setSearchedUsers((prev) => prev.filter((u) => u.id !== userId));
        setRegisteredUsers((prev) => prev.filter((u) => u.id !== userId));
      } else {
        toast(`Failed to delete user: ${data.error || "Error"}`);
      }
    } catch {
      toast("Error deleting user.");
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleCopyCredentials = (username: string, pass: string) => {
    const text = `FTN Staff Login Credentials\nWebsite: ${window.location.origin}/auth/signin\nUsername: ${username}\nPassword: ${pass}`;
    navigator.clipboard.writeText(text);
    setCopiedCredential(true);
    setTimeout(() => setCopiedCredential(false), 2500);
  };

  const fetchModerations = () => {
    fetch("/api/admin/moderation")
      .then((res) => res.json())
      .then((data: any) => {
        if (data && Array.isArray(data.moderations)) {
          setModerations(data.moderations);
        }
      })
      .catch(() => {});
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = newChannelInput.trim();
    if (!val) return;
    if (!youtubeChannels.includes(val)) {
      const updated = [...youtubeChannels, val];
      setYoutubeChannels(updated);
      setNewChannelInput("");

      // Automatically trigger ingestion for this channel immediately
      setIsSyncingVideos(true);
      setSyncStatus(`Resolving & syncing channel ${val}...`);
      try {
        const res = await fetch("/api/sync/youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelIds: [val] }),
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (res.ok) {
          setSyncStatus(`Channel added! ${data.synced || 0} video(s) synced from ${val}. Click "Save Changes" above to persist.`);
          fetch("/api/plus/videos?fresh=1")
            .then((r) => r.json())
            .then((vd: any) => {
              if (vd && Array.isArray(vd.videos)) setIngestedVideos(vd.videos);
            })
            .catch(() => {});
        } else {
          setSyncStatus(`Channel added. Sync notice: ${data.error || "Check channel handle/ID"}`);
        }
      } catch {
        setSyncStatus(`Channel added. Click "Sync Channels Now" to ingest.`);
      } finally {
        setIsSyncingVideos(false);
      }
    } else {
      setNewChannelInput("");
    }
  };

  const handleAddTwitchChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const login = newTwitchInput.trim().toLowerCase().replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//, "").split(/[/?#]/)[0].replace(/^@/, "");
    if (!/^[a-z0-9_]{3,25}$/.test(login)) {
      setSyncStatus("That doesn't look like a Twitch channel name. Use the name from twitch.tv/<name>.");
      return;
    }
    if (!twitchChannels.includes(login)) setTwitchChannels([...twitchChannels, login]);
    setNewTwitchInput("");
  };

  const handleRemoveChannel = (ch: string) => {
    const updatedChannels = youtubeChannels.filter((c) => c !== ch);
    const nextFeatured = hiddenFeaturedChannels.filter((c) => c !== ch);
    const nextTrending = hiddenTrendingChannels.filter((c) => c !== ch);
    setYoutubeChannels(updatedChannels);
    setHiddenFeaturedChannels(nextFeatured);
    setHiddenTrendingChannels(nextTrending);
    fetch("/api/radio/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        youtubeChannels: updatedChannels,
        hiddenFeaturedChannels: nextFeatured,
        hiddenTrendingChannels: nextTrending,
      }),
    }).catch(() => {});
  };

  const handleToggleHideFeatured = async (channel: string) => {
    const isHidden = hiddenFeaturedChannels.includes(channel);
    const updated = isHidden
      ? hiddenFeaturedChannels.filter((c) => c !== channel)
      : [...hiddenFeaturedChannels, channel];
    setHiddenFeaturedChannels(updated);
    try {
      await fetch("/api/radio/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenFeaturedChannels: updated }),
      });
    } catch {}
  };

  const handleToggleHideTrending = async (channel: string) => {
    const isHidden = hiddenTrendingChannels.includes(channel);
    const updated = isHidden
      ? hiddenTrendingChannels.filter((c) => c !== channel)
      : [...hiddenTrendingChannels, channel];
    setHiddenTrendingChannels(updated);
    try {
      await fetch("/api/radio/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenTrendingChannels: updated }),
      });
    } catch {}
  };

  const handleAddSocialLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSocialName.trim() || !newSocialUrl.trim()) return;
    const newLink: SocialLink = {
      id: "soc-" + crypto.randomUUID().slice(0, 8),
      name: newSocialName.trim(),
      url: newSocialUrl.trim(),
    };
    setSocialLinks([...socialLinks, newLink]);
    setNewSocialName("");
    setNewSocialUrl("");
  };

  const handleRemoveSocialLink = (id: string) => {
    setSocialLinks(socialLinks.filter((l) => l.id !== id));
  };

  const extractYouTubeId = (url: string) => {
    const trimmed = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  };

  const fetchYouTubeVideoMeta = async (ytid: string) => {
    try {
      const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${ytid}`);
      if (res.ok) {
        const data = (await res.json()) as any;
        return {
          title: data.title || `Video (${ytid})`,
          channelTitle: data.author_name || "YouTube",
          thumbnailUrl: `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`,
        };
      }
    } catch {}
    return {
      title: `Video (${ytid})`,
      channelTitle: "YouTube",
      thumbnailUrl: `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`,
    };
  };

  const handleAddVideoToNewPlaylist = async () => {
    const ytid = extractYouTubeId(newPlaylistVideoUrl);
    if (!ytid) {
      toast("Please enter a valid YouTube video URL or 11-character video ID.");
      return;
    }
    if (newPlaylistVideos.some((v) => v.youtubeId === ytid)) {
      toast("This video is already in the playlist.");
      return;
    }
    setAddingPlaylistVideo(true);
    const meta = await fetchYouTubeVideoMeta(ytid);
    setNewPlaylistVideos((prev) => [...prev, { youtubeId: ytid, ...meta }]);
    setNewPlaylistVideoUrl("");
    setAddingPlaylistVideo(false);
  };

  const handleRemoveVideoFromNewPlaylist = (ytid: string) => {
    setNewPlaylistVideos((prev) => prev.filter((v) => v.youtubeId !== ytid));
  };

  const handleAddVideoToEditingPlaylist = async () => {
    if (!editingSwimlane) return;
    const ytid = extractYouTubeId(editingPlaylistVideoUrl);
    if (!ytid) {
      toast("Please enter a valid YouTube video URL or 11-character video ID.");
      return;
    }
    const currentList = editingSwimlane.playlistVideos || [];
    if (currentList.some((v) => v.youtubeId === ytid)) {
      toast("This video is already in the playlist.");
      return;
    }
    setAddingEditPlaylistVideo(true);
    const meta = await fetchYouTubeVideoMeta(ytid);
    setEditingSwimlane({
      ...editingSwimlane,
      playlistVideos: [...currentList, { youtubeId: ytid, ...meta }],
    });
    setEditingPlaylistVideoUrl("");
    setAddingEditPlaylistVideo(false);
  };

  const handleRemoveVideoFromEditingPlaylist = (ytid: string) => {
    if (!editingSwimlane) return;
    setEditingSwimlane({
      ...editingSwimlane,
      playlistVideos: (editingSwimlane.playlistVideos || []).filter((v) => v.youtubeId !== ytid),
    });
  };

  const handleMoveSwimlane = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= swimlanes.length) return;
    const updated = [...swimlanes];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setSwimlanes(updated);
  };

  const handleAddSwimlane = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSwimlaneTitle.trim()) return;

    if (newSwimlaneType === "playlist" && newPlaylistVideos.length === 0) {
      toast("Please add at least one YouTube video to your curated playlist.");
      return;
    }

    const newLane: CustomSwimlane = {
      id: "sl-" + crypto.randomUUID().slice(0, 8),
      title: newSwimlaneTitle.trim(),
      type: newSwimlaneType,
      channel: newSwimlaneType === "filter" ? (newSwimlaneChannel.trim() || undefined) : undefined,
      regexPattern: newSwimlaneType === "filter" ? (newSwimlaneRegex.trim() || undefined) : undefined,
      sortBy: newSwimlaneSort,
      playlistVideos: newSwimlaneType === "playlist" ? newPlaylistVideos : undefined,
    };
    setSwimlanes([...swimlanes, newLane]);
    setNewSwimlaneTitle("");
    setNewSwimlaneChannel("");
    setNewSwimlaneRegex("");
    setNewPlaylistVideos([]);
    setNewPlaylistVideoUrl("");
    setNewSwimlaneSort("recent");
  };

  const handleSaveEditedSwimlane = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSwimlane) return;
    setSwimlanes(
      swimlanes.map((lane) => (lane.id === editingSwimlane.id ? editingSwimlane : lane))
    );
    setEditingSwimlane(null);
  };

  const handleRemoveSwimlane = (id: string) => {
    setSwimlanes(swimlanes.filter((s) => s.id !== id));
  };

  const handleMuteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserToMute) {
      toast("Please select a user to moderate.");
      return;
    }
    try {
      const res = await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserToMute,
          duration: muteDuration,
          reason: muteReason.trim() || "Violation of community standards",
        }),
      });
      if (res.ok) {
        setMuteReason("");
        fetchModerations();
        toast("User muted successfully.");
      } else {
        const d = (await res.json()) as any;
        toast(d.error || "Failed to moderate user.");
      }
    } catch {
      toast("Error applying moderation.");
    }
  };

  const handleUnmuteUser = async (id: string) => {
    if (!await confirmDialog("Are you sure you want to unmute this user?")) return;
    try {
      const res = await fetch(`/api/admin/moderation?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchModerations();
      }
    } catch {
      toast("Error unmuting user.");
    }
  };

  const handlePurgeDummyVideos = async () => {
    if (!await confirmDialog("This will remove all boilerplate demo videos from the database. Real synced YouTube videos will be kept. Proceed?")) return;
    setPurgingVideos(true);
    try {
      const res = await fetch("/api/radio/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge_dummy_videos" }),
      });
      if (res.ok) {
        toast("Demo videos purged from library.");
      }
    } catch {
      toast("Failed to purge demo videos.");
    } finally {
      setPurgingVideos(false);
    }
  };

  const handleToggleHideVideo = async (videoId: string) => {
    const isCurrentlyHidden = hiddenVideoIds.includes(videoId);
    const updatedHidden = isCurrentlyHidden
      ? hiddenVideoIds.filter((id) => id !== videoId)
      : [...hiddenVideoIds, videoId];

    setHiddenVideoIds(updatedHidden);

    try {
      await fetch("/api/radio/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hiddenVideoIds: updatedHidden,
        }),
      });
    } catch {}
  };

  const handleDeleteVideo = async (videoId: string, title: string) => {
    if (!await confirmDialog(`Are you sure you want to completely remove "${title}" from the FTN+ database?\n\nIt will also be hidden so it does not reappear on future channel syncs.`)) {
      return;
    }

    setDeletingVideoId(videoId);
    const updatedHidden = Array.from(new Set([...hiddenVideoIds, videoId]));
    setHiddenVideoIds(updatedHidden);
    setIngestedVideos((prev) => prev.filter((v) => v.youtubeId !== videoId && v.id !== videoId));

    try {
      const res = await fetch("/api/radio/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_video",
          videoId,
          hiddenVideoIds: updatedHidden,
        }),
      });
      if (res.ok) {
        toast(`Video "${title}" removed from FTN+ library.`);
      } else {
        toast("Failed to delete video.");
      }
    } catch {
      toast("Error deleting video.");
    } finally {
      setDeletingVideoId(null);
    }
  };

  const handleSaveAllSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    try {
      const res = await fetch("/api/radio/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamUrl: streamUrlInput.trim(),
          statusJson: statusJsonInput.trim(),
          webradioEnabled: webradioToggle,
          allowSignIn,
          authMode,
          ftnPlusAccess,
          tiplineAccess,
          discordUrl: discordUrl.trim(),
          socialLinks,
          bannedWords: bannedWordsInput,
          youtubeChannels,
          twitchChannels,
          hiddenFeaturedChannels,
          hiddenTrendingChannels,
          customSwimlanes: swimlanes,
          hiddenVideoIds,
          autoModEnabled,
          donationBannerEnabled,
          autoModThreshold: Number(autoModThreshold),
          autoModMuteDuration,
        }),
      });

      const radioRes = await fetch("/api/admin/radio/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public: radioPublic, secure: radioSecure }),
      });

      if (res.ok && radioRes.ok) {
        setBaseline(payloadJson);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        toast("Failed to save site configuration.");
      }
    } catch (err) {
      toast("Error saving configuration.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTriggerSync = async () => {
    setIsSyncingVideos(true);
    setSyncStatus(null);
    try {
      const res = await fetch("/api/sync/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: youtubeChannels }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (res.ok) {
        setSyncStatus(`Sync completed! ${data.synced || 0} videos updated across ${data.channels?.length || youtubeChannels.length} channel(s).`);
        // Refresh video list in admin table immediately
        fetch("/api/plus/videos?fresh=1")
          .then((r) => r.json())
          .then((vd: any) => {
            if (vd && Array.isArray(vd.videos)) setIngestedVideos(vd.videos);
          })
          .catch(() => {});
      } else {
        setSyncStatus(`Sync error: ${data.error || "Failed to sync"}`);
      }
    } catch (err) {
      setSyncStatus("Failed to initiate YouTube video sync.");
    } finally {
      setIsSyncingVideos(false);
    }
  };

  const [settingQuery, setSettingQuery] = useState("");
  const [settingMatches, setSettingMatches] = useState(0);
  useEffect(() => {
    const q = settingQuery.trim().toLowerCase();
    let n = 0;
    document.querySelectorAll<HTMLElement>("main section, [data-settings-root] section").forEach((el) => {
      if (!el.matches("section.grid")) return;
      const hit = !q || (el.textContent ?? "").toLowerCase().includes(q) || Array.from(el.querySelectorAll("input,textarea,select")).some((i) => ((i as HTMLInputElement).placeholder ?? "").toLowerCase().includes(q));
      el.style.display = hit ? "" : "none";
      if (hit && q) n++;
    });
    setSettingMatches(n);
  }, [settingQuery, activeTab, videosLoaded]);

  return (
    <AdminAuthGuard requiredPermission={canConfigureSite} featureTitle="Site Settings & Configuration">
      <div className="w-full space-y-8 text-neutral-900 dark:text-white">
      <AdminPageHeader
        title={SETTINGS_PAGES.find((t) => t.href === (activeTab === "site" ? "/admin/settings" : `/admin/settings/${activeTab}`))?.title ?? "Settings"}
        description={SETTINGS_PAGES.find((t) => t.href === (activeTab === "site" ? "/admin/settings" : `/admin/settings/${activeTab}`))?.description}
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-neutral-400" />
        <input
          type="search"
          value={settingQuery}
          onChange={(e) => setSettingQuery(e.target.value)}
          placeholder="Search settings on this page"
          aria-label="Search settings on this page"
          className="h-10 w-full rounded-full border border-neutral-300 bg-white pl-10 pr-4 text-sm focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-900"
        />
        {settingQuery.trim() && <p className="mt-2 pl-4 text-xs text-neutral-500">{settingMatches === 0 ? "No settings on this page match. Use the jump bar to search every page." : `${settingMatches} matching ${settingMatches === 1 ? "section" : "sections"}`}</p>}
      </div>

      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-neutral-200 dark:border-neutral-800 lg:hidden">
        {SETTINGS_PAGES.map((t) => (
          <Link key={t.href} href={t.href} aria-current={pathname === t.href ? "page" : undefined} className={`shrink-0 border-b-4 px-4 py-3 text-sm font-bold ${pathname === t.href ? "border-brand" : "border-transparent text-neutral-500"}`}>
            {t.title}
          </Link>
        ))}
      </div>

      {activeTab === "site" && (
        <div className="grid items-start gap-8 2xl:grid-cols-2 2xl:[&>section]:grid-cols-1">
          <AdminSection title="Donation banner" description="The &quot;FTN needs your help!&quot; appeal at the top of the homepage.">
            <AdminRow label="Show on homepage" hint={donationBannerEnabled ? "Visitors see the appeal." : "Hidden from visitors."}>
              <AdminSwitch checked={donationBannerEnabled} onChange={setDonationBannerEnabled} label="Show donation banner" />
            </AdminRow>
          {sectionFooter("donation")}
</AdminSection>

      {/* 3. Discord & Social Media Links */}
      <AdminSection title="Links" description="The Discord button in the navbar and the social links in the footer.">
        

        <div className="space-y-6">
          {/* Discord Button URL */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold">
              Navbar Discord Button URL
            </label>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              The purple Discord button next to FTN+ in the navigation bar links here.
            </p>
            <Input
              value={discordUrl}
              onChange={(e) => setDiscordUrl(e.target.value)}
              placeholder="https://discord.gg/ftn"
              className="font-mono text-xs"
            />
          </div>

          {/* Custom Footer Social Links */}
          <div className="space-y-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <label className="block text-sm font-semibold">
              Footer Social Links ({socialLinks.length})
            </label>

            <form onSubmit={handleAddSocialLink} className="flex flex-col sm:flex-row gap-2">
              <Input
                value={newSocialName}
                onChange={(e) => setNewSocialName(e.target.value)}
                placeholder="Platform Name (e.g. Bluesky / Twitter)"
                className="text-xs"
              />
              <Input
                value={newSocialUrl}
                onChange={(e) => setNewSocialUrl(e.target.value)}
                placeholder="https://..."
                className="font-mono text-xs"
              />
              <Button type="submit" size="sm" className="bg-brand hover:bg-brand-hover text-brand-ink font-bold text-xs shrink-0 cursor-pointer shadow-sm">
                <Plus className="h-3.5 w-3.5" /> Add Link
              </Button>
            </form>

            <div className="space-y-2">
              {socialLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 px-4 py-2.5"
                >
                  <div>
                    <span className="text-xs font-bold text-neutral-900 dark:text-white mr-2">{link.name}:</span>
                    <span className="font-mono text-xs text-neutral-600 dark:text-neutral-400">{link.url}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveSocialLink(link.id)}
                    className="text-neutral-400 hover:text-red-500 transition p-1 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      {sectionFooter("links")}
</AdminSection>
    </div>
  )}

      {(activeTab === "radio" || activeTab === "connections") && (
        <div className="grid items-start gap-8 2xl:grid-cols-2 2xl:[&>section]:grid-cols-1">
          {/* 1. Webradio Stream Settings */}
          {activeTab === "radio" && (<>
          <AdminSection title="Webradio stream" description="Where the live audio and its now-playing data come from.">
        <AdminRow label="Webradio on FTN+" hint={webradioToggle ? "The radio player is live for visitors." : "The radio player is switched off."}>
          <AdminSwitch checked={webradioToggle} onChange={setWebradioToggle} label="Enable webradio" />
        </AdminRow>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold">
              Icecast Audio Stream URL (.mp3 / .aac)
            </label>
            <Input
              value={streamUrlInput}
              onChange={(e) => setStreamUrlInput(e.target.value)}
              placeholder="https://icecast.ftnmedia.org/live.mp3"
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold">
              Status JSON Metadata Endpoint
            </label>
            <Input
              value={statusJsonInput}
              onChange={(e) => setStatusJsonInput(e.target.value)}
              placeholder="https://icecast.ftnmedia.org/status-json.xsl"
              className="font-mono text-xs"
            />
          </div>
        </div>

        {/* Radio branding & Discord bot */}
        {sectionFooter("stream")}
</AdminSection>
<AdminSection title="Station & Discord bot" description="Branding on the radio page and the details for the Discord bot.">
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Station Name</label>
              <Input value={radioPublic.stationName} onChange={(e) => setRadioPublic({ ...radioPublic, stationName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Default Album Art URL</label>
              <Input value={radioPublic.defaultArtUrl} onChange={(e) => setRadioPublic({ ...radioPublic, defaultArtUrl: e.target.value })} placeholder="Shown when no show or track art is found" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Discord Bot Invite Link</label>
              <Input value={radioPublic.discordBotLink} onChange={(e) => setRadioPublic({ ...radioPublic, discordBotLink: e.target.value })} placeholder="https://discord.com/oauth2/authorize?client_id=..." />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Discord Bot Setup Command</label>
              <Input value={radioPublic.discordBotCommand} onChange={(e) => setRadioPublic({ ...radioPublic, discordBotCommand: e.target.value })} placeholder="/setup" className="font-mono text-xs" />
            </div>
          </div>
        

        {/* Icecast */}
        {sectionFooter("station")}
</AdminSection>
</>)}
{activeTab === "connections" && (<>
<AdminSection title="Icecast" description="Optional admin credentials let the site read live listener counts and track metadata. They are stored encrypted and never sent to visitors.">
{connectionBadge(!!(radioSecure.icecastAdminUrl && radioSecure.icecastPassword))}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Admin URL</label>
              <Input value={radioSecure.icecastAdminUrl} onChange={(e) => setRadioSecure({ ...radioSecure, icecastAdminUrl: e.target.value })} placeholder="http://127.0.0.1:8000" className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Mount Point</label>
              <Input value={radioSecure.icecastMount} onChange={(e) => setRadioSecure({ ...radioSecure, icecastMount: e.target.value })} placeholder="/autodj" className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Admin Username</label>
              <Input value={radioSecure.icecastUsername} onChange={(e) => setRadioSecure({ ...radioSecure, icecastUsername: e.target.value })} className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Admin Password</label>
              <Input type="password" value={radioSecure.icecastPassword} onChange={(e) => setRadioSecure({ ...radioSecure, icecastPassword: e.target.value })} className="font-mono text-xs" />
            </div>
          </div>
        

        {/* Password rotation */}
        {sectionFooter("icecast")}
</AdminSection>
<AdminSection title="Password rotation" description="Rotation runs a small service on the radio server. Automatic rotation is checked hourly by a scheduled GitHub workflow; the current password is shown at the top of the Schedule admin page.">
{connectionBadge(!!(radioSecure.rotationEndpointUrl && radioSecure.rotationEndpointToken))}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Rotation Endpoint URL</label>
              <Input value={radioSecure.rotationEndpointUrl} onChange={(e) => setRadioSecure({ ...radioSecure, rotationEndpointUrl: e.target.value })} placeholder="https://euno.cc/rotate" className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Rotation Endpoint Token</label>
              <Input type="password" value={radioSecure.rotationEndpointToken} onChange={(e) => setRadioSecure({ ...radioSecure, rotationEndpointToken: e.target.value })} className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Auto-Rotate Frequency</label>
              <Select
                value={radioSecure.rotationFrequencyHours}
                onChange={(e) => setRadioSecure({ ...radioSecure, rotationFrequencyHours: Number(e.target.value) })}
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              >
                <option value={0}>Off</option>
                <option value={12}>Every 12 hours</option>
                <option value={24}>Every 24 hours</option>
                <option value={48}>Every 48 hours</option>
                <option value={72}>Every 72 hours</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Rotation Time (UTC, 24h+ only)</label>
              <DateTimeInput
                type="time"
                value={radioSecure.rotationTimeUtc}
                onChange={(e) => setRadioSecure({ ...radioSecure, rotationTimeUtc: e.target.value })}
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-sm font-semibold">Discord Webhook (rotation notices)</label>
              <Input type="password" value={radioSecure.discordWebhookUrl} onChange={(e) => setRadioSecure({ ...radioSecure, discordWebhookUrl: e.target.value })} placeholder="https://discord.com/api/webhooks/..." className="font-mono text-xs" />
            </div>
          </div>
        

        {/* API keys */}
        {sectionFooter("rotation")}
</AdminSection>
<AdminSection title="Album art" description="Keys and lookup order for finding cover art of the track on air.">
{connectionBadge(!!(radioSecure.lastFmApiKey || radioSecure.fanartTvApiKey))}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Last.fm API Key</label>
              <Input type="password" value={radioSecure.lastFmApiKey} onChange={(e) => setRadioSecure({ ...radioSecure, lastFmApiKey: e.target.value })} className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Fanart.tv API Key</label>
              <Input type="password" value={radioSecure.fanartTvApiKey} onChange={(e) => setRadioSecure({ ...radioSecure, fanartTvApiKey: e.target.value })} className="font-mono text-xs" />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <label className="block text-sm font-semibold">Lookup Priority {i + 1}</label>
                <Select
                  value={radioSecure.artPriority[i] || ""}
                  onChange={(e) => {
                    const next = [...radioSecure.artPriority];
                    next[i] = e.target.value;
                    setRadioSecure({ ...radioSecure, artPriority: next.filter(Boolean) });
                  }}
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                >
                  <option value="lastfm">Last.fm</option>
                  <option value="itunes">iTunes</option>
                  <option value="fanart">Fanart.tv</option>
                </Select>
              </div>
            ))}
          </div>
        
      {sectionFooter("art")}
</AdminSection>
</>)}

    </div>
  )}

  {/* 2. AUTHENTICATION & ACCESS CONTROL TAB */}
  {activeTab === "access" && (
    <div className="grid items-start gap-8 2xl:grid-cols-2 2xl:[&>section]:grid-cols-1">
      {/* 2. Access Control, Authentication Mode & User Management */}
      <AdminSection title="Sign-in" description="How visitors and staff create accounts and log in.">
        

        <div className="space-y-6">
          {/* Account Creation Toggle */}
          <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <label className="block text-sm font-semibold">
                Account Creation
              </label>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {authMode === "credentials"
                  ? "Account creation is locked to DISABLED in Password Mode. Only administrators can add accounts."
                  : allowSignIn
                  ? "Account creation is enabled. New visitors can register via Roblox OAuth."
                  : "Account creation is disabled. Only pre-existing accounts can sign in."}
              </p>
            </div>

            <AdminSwitch checked={allowSignIn && authMode !== "credentials"} disabled={authMode === "credentials"} onChange={setAllowSignIn} label="Account creation" />
          </div>

          {/* Authentication Method Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <label className="block text-sm font-semibold">
                Active Authentication Method
              </label>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {authMode === "roblox"
                  ? "Roblox OAuth 2.0: Visitors and staff log in directly using official Roblox OpenID OAuth."
                  : "Password / Username Mode: Direct Username & Password login. Accounts are provisioned below."}
              </p>
            </div>

            <AdminSegmented
              value={authMode}
              onChange={(m) => {
                setAuthMode(m);
                if (m === "credentials") setAllowSignIn(false);
              }}
              options={[
                { value: "roblox", label: "Roblox OAuth" },
                { value: "credentials", label: "Username & password" },
              ]}
            />
          </div>

        </div>
      {sectionFooter("signin")}
</AdminSection>
      <AdminSection title="Access gates" description="Who may open FTN+ and the tipline.">
        <div className="space-y-6">
          {/* FTN+ Access Gate */}
          <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <label className="block text-sm font-semibold">
                FTN+ Access Gate
              </label>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {ftnPlusAccess === "public"
                  ? "Public: Anyone can browse and watch FTN+ videos."
                  : "Members Only: Visitors must authenticate with Roblox to enter FTN+."}
              </p>
            </div>

            <AdminSegmented
              value={ftnPlusAccess}
              onChange={setFtnPlusAccess}
              options={[
                { value: "public", label: <><Globe className="h-3 w-3" /> Public</> },
                { value: "members_only", label: <><Lock className="h-3 w-3" /> Members only</> },
              ]}
            />
          </div>

          {/* Tipline Access Gate */}
          <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <label className="block text-sm font-semibold">
                Investigative Tipline Access Gate
              </label>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {tiplineAccess === "public"
                  ? "Public: Anyone can submit news tips anonymously or with their Roblox username."
                  : "Members Only: Visitors must be logged in to submit leads on the tipline."}
              </p>
            </div>

            <AdminSegmented
              value={tiplineAccess}
              onChange={setTiplineAccess}
              options={[
                { value: "public", label: <><Globe className="h-3 w-3" /> Public</> },
                { value: "members_only", label: <><Lock className="h-3 w-3" /> Members only</> },
              ]}
            />
          </div>

        </div>
      {sectionFooter("gates")}
</AdminSection>
      <AdminSection title="Accounts" description="Staff accounts and password resets.">
        <div className="space-y-6">
          {/* If Roblox Mode: Informative Notice */}
          {authMode === "roblox" && (
            <div className="rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 p-5 text-xs text-neutral-600 dark:text-neutral-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <strong className="text-neutral-900 dark:text-white">Roblox OAuth 2.0 Active</strong>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  User accounts and usernames are authenticated via Roblox OpenID. To configure permissions or assign division roles, use the Staff Roles console.
                </p>
              </div>
              <Link href="/admin/roles">
                <Button size="sm" variant="outline" className="text-xs border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-800 shrink-0 cursor-pointer">
                  <Shield className="h-3.5 w-3.5 mr-1 text-brand-text" /> Open Roles Console
                </Button>
              </Link>
            </div>
          )}

          {/* If Password Mode: Add Employee / Provision Password Form */}
          {authMode === "credentials" && (
            <div className="rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-brand-text" />
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                  Add Employee / Provision Staff Password
                </h3>
              </div>

              <form onSubmit={handleCreateEmployee} className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={newEmployeeUsername}
                  onChange={(e) => setNewEmployeeUsername(e.target.value)}
                  placeholder="Enter Roblox username (e.g. alphaze1)"
                  required
                  className="text-xs"
                />
                <Button
                  type="submit"
                  disabled={creatingEmployee || !newEmployeeUsername.trim()}
                  className="bg-brand hover:bg-brand-hover text-brand-ink font-bold text-xs shrink-0 cursor-pointer shadow-sm"
                >
                  {creatingEmployee ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Generating...
                    </>
                  ) : (
                    <>
                      <Key className="h-3.5 w-3.5 mr-1" /> Create & Generate Password
                    </>
                  )}
                </Button>
              </form>

              {/* Created Account Details Card */}
              {createdEmployeeResult && (
                <div className="rounded-2xl border border-brand bg-brand/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden border border-brand">
                        {createdEmployeeResult.avatarUrl ? (
                          <img
                            src={createdEmployeeResult.avatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center font-bold text-neutral-800 dark:text-white text-xs">
                            {createdEmployeeResult.displayName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-neutral-900 dark:text-white">
                          {createdEmployeeResult.displayName}
                        </div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          @{createdEmployeeResult.username}
                        </div>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                      ACCOUNT READY
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-black/60 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-[10px] uppercase font-mono text-neutral-500 dark:text-neutral-400">
                        Generated Password
                      </div>
                      <div className="text-xs font-mono font-bold text-brand-text">
                        {createdEmployeeResult.password}
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        handleCopyCredentials(
                          createdEmployeeResult.username,
                          createdEmployeeResult.password
                        )
                      }
                      className="text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-white gap-1 cursor-pointer"
                    >
                      {copiedCredential ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy Credentials
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reset Password Result Notification */}
          {resetPasswordResult && (
            <div className="rounded-2xl border border-brand bg-brand/10 p-4 space-y-2">
              <div className="text-xs font-bold text-brand-text">New Password Generated</div>
              <div className="p-2 rounded bg-white dark:bg-black/60 font-mono text-xs font-bold text-neutral-900 dark:text-white select-all border border-neutral-200 dark:border-transparent">
                {resetPasswordResult.password}
              </div>
            </div>
          )}

          {/* User Search Bar */}
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="block text-sm font-semibold">
                Search User Accounts
              </label>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Search a user by Roblox username or display name to inspect their account {authMode === "credentials" ? "or manage credentials." : "or view roles."}
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchUsers(userSearchQuery);
              }}
              className="flex gap-2 max-w-lg"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                <Input
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Search Roblox username or display name..."
                  className="pl-9 text-xs"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={searchingUsers}
                className="text-xs bg-brand hover:bg-brand-hover text-brand-ink font-bold cursor-pointer shadow-sm"
              >
                {searchingUsers ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
              </Button>
            </form>

            {/* Search Results */}
            {searchingUsers ? (
              <div className="p-8 text-center text-sm text-neutral-500">Searching accounts...</div>
            ) : hasSearched && searchedUsers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
                No user accounts found matching &quot;{userSearchQuery}&quot;.
              </div>
            ) : (
              <div className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
                {searchedUsers.map((emp) => (
                  <div
                    key={emp.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-neutral-300 dark:hover:border-neutral-700 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-white overflow-hidden flex items-center justify-center font-bold text-xs shrink-0 border border-neutral-300 dark:border-neutral-700">
                        {emp.avatarUrl ? (
                          <img src={emp.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          (emp.displayName || "U").slice(0, 2).toUpperCase()
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-neutral-900 dark:text-white">{emp.displayName}</span>
                          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">@{emp.robloxUsername}</span>
                          {authMode === "credentials" && (
                            emp.hasPassword ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold">
                                PASSWORD SET
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-brand/20 border border-brand/40 text-amber-700 dark:text-amber-400 text-[9px] font-bold">
                                NO PASSWORD
                              </span>
                            )
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {emp.roles && emp.roles.length > 0 ? (
                            emp.roles.map((r: string) => (
                              <span
                                key={r}
                                className="px-2 py-0.5 rounded-full bg-neutral-100 text-brand-text border border-neutral-200 dark:border-transparent dark:bg-neutral-800 text-[10px] font-semibold"
                              >
                                {r.replace("_", " ")}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-neutral-500">No roles assigned</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {authMode === "credentials" ? (
                        <>
                          {editingUsernameUserId === emp.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={newUsernameInput}
                                onChange={(e) => setNewUsernameInput(e.target.value)}
                                placeholder="New username"
                                className="h-8 text-xs w-36"
                              />
                              <Button
                                size="sm"
                                onClick={() => handleUpdateUsername(emp.id)}
                                disabled={updatingUsername}
                                className="h-8 text-xs bg-brand text-brand-ink font-bold"
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingUsernameUserId(null)}
                                className="h-8 text-xs text-neutral-500 dark:text-neutral-400"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingUsernameUserId(emp.id);
                                setNewUsernameInput(emp.robloxUsername);
                              }}
                              className="h-8 text-xs border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-white cursor-pointer"
                            >
                              <Edit2 className="h-3 w-3 mr-1" /> Edit
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resettingPasswordUserId === emp.id}
                            onClick={() => handleResetPassword(emp.id, emp.robloxUsername)}
                            className="h-8 text-xs border-neutral-300 bg-neutral-50 text-brand-text hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800 cursor-pointer"
                          >
                            <Key className="h-3 w-3 mr-1" /> Reset Password
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={deletingUserId === emp.id}
                            onClick={() => handleDeleteUser(emp.id, emp.robloxUsername)}
                            className="h-8 text-xs text-neutral-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                            title="Delete User Account"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Link href="/admin/roles">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-white cursor-pointer"
                          >
                            <Shield className="h-3 w-3 mr-1 text-brand-text" /> Manage Roles
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </AdminSection>
    </div>
  )}

  {/* 3. MODERATION & SAFETY TAB */}
  {activeTab === "moderation" && (
    <div className="grid items-start gap-8 2xl:grid-cols-2 2xl:[&>section]:grid-cols-1">
      {/* 4. User Moderation & Auto-Mod */}
      <AdminSection title="Mute a user" description="Stop a registered user from commenting, for a set time.">
        <div className="space-y-6">
          <form onSubmit={handleMuteUser} className="space-y-4">
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select
                value={selectedUserToMute}
                onChange={(e) => setSelectedUserToMute(e.target.value)}
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                required
              >
                <option value="">Select User to Mute...</option>
                {registeredUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} (@{u.robloxUsername})
                  </option>
                ))}
              </Select>

              <Select
                value={muteDuration}
                onChange={(e) => setMuteDuration(e.target.value as any)}
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              >
                <option value="24h">Mute for 24 Hours</option>
                <option value="1w">Mute for 1 Week</option>
                <option value="1m">Mute for 1 Month</option>
                <option value="indefinite">Mute Indefinitely</option>
              </Select>

              <Input
                value={muteReason}
                onChange={(e) => setMuteReason(e.target.value)}
                placeholder="Reason (e.g. Toxicity)"
                className="text-xs"
              />
            </div>

            <Button type="submit" size="sm" className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer shadow-sm">
              Apply Mute
            </Button>
          </form>

        </div>
      </AdminSection>
      <AdminSection title={`Muted accounts (${moderations.length})`} description="Everyone currently muted, with the reason and expiry.">
        <div className="space-y-6">
          <div className="space-y-2">

            {moderations.length === 0 ? (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-900 dark:bg-neutral-900/50 p-4 text-center text-xs text-neutral-500">
                No users are currently muted.
              </div>
            ) : (
              <div className="space-y-2">
                {moderations.map((mod) => (
                  <div
                    key={mod.id}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 px-4 py-3"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                        <span>{mod.displayName || mod.robloxUsername || "User"}</span>
                        <span className="text-neutral-500 dark:text-neutral-400 font-normal">(@{mod.robloxUsername})</span>
                        <span className="rounded bg-red-100 border border-red-300 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300 px-2 py-0.5 text-[10px] font-mono uppercase">
                          {mod.duration}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Reason: {mod.reason} • Moderated by: {mod.moderatedBy}
                        {mod.expiresAt && ` • Expires: ${new Date(mod.expiresAt).toLocaleDateString()}`}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnmuteUser(mod.id)}
                      className="text-xs h-7 border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-white cursor-pointer"
                    >
                      Unmute
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </AdminSection>
      <AdminSection title="Auto-moderation" description="Mute people automatically when they keep tripping the profanity filter.">
        <div className="space-y-4">
          <div>
            <AdminRow label="Mute repeat offenders" hint="After enough filtered comments in five minutes, the user is muted.">
              <AdminSwitch checked={autoModEnabled} onChange={setAutoModEnabled} label="Auto-moderation" />
            </AdminRow>
            {autoModEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Violation Threshold (Within 5 mins)</label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={autoModThreshold}
                    onChange={(e) => setAutoModThreshold(parseInt(e.target.value, 10) || 3)}
                    className="text-xs h-8"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Auto-Mute Penalty Duration</label>
                  <Select
                    value={autoModMuteDuration}
                    onChange={(e) => setAutoModMuteDuration(e.target.value as any)}
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                  >
                    <option value="24h">24 Hours</option>
                    <option value="1w">1 Week</option>
                    <option value="1m">1 Month</option>
                    <option value="indefinite">Indefinite</option>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>
      {sectionFooter("automod")}
</AdminSection>

      {/* 7. Comment Profanity Filter */}
      <AdminSection title="Profanity filter" description="Comments containing these words are blocked.">
        

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold">
              Banned Words (One per line)
            </label>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              Comments containing any of these words will be blocked and processed by auto-moderation.
            </p>
          </div>

          <Textarea
            value={bannedWordsInput}
            onChange={(e) => setBannedWordsInput(e.target.value)}
            rows={5}
            placeholder="swear_word_1&#10;swear_word_2"
            className="font-mono text-xs"
          />
        </div>
      {sectionFooter("profanity")}
</AdminSection>
    </div>
  )}

  {/* 4. FTN+ VIDEO NETWORK TAB */}
  {activeTab === "plus" && (
    <div className="space-y-8">
      {/* 5. FTN+ YouTube Channels & Library Purge */}
      <AdminSection title="Video sync" description="Pull the latest videos from the channels below into FTN+.">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
          

          <div className="flex items-center gap-2">
            <Button
              onClick={handlePurgeDummyVideos}
              disabled={purgingVideos}
              variant="outline"
              size="sm"
              className="text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300 dark:hover:bg-red-900/40 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Purge Demo Videos
            </Button>
            <Button
              onClick={handleTriggerSync}
              disabled={isSyncingVideos}
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-neutral-300 bg-neutral-100 text-neutral-800 hover:bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:text-white cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncingVideos ? "animate-spin text-brand-text" : ""}`} />
              {isSyncingVideos ? "Syncing..." : "Sync Channels Now"}
            </Button>
          </div>
        </div>

        {syncStatus && (
          <div className="rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 p-3 text-xs text-neutral-800 dark:text-neutral-300">
            {syncStatus}
          </div>
        )}

      </AdminSection>
      <AdminSection title="Twitch channels" description="Twitch channels that appear in FTN+ and on the main site as live streams while they are broadcasting. Needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET set in Cloudflare.">
        <div className="space-y-3">
          <label className="block text-sm font-semibold">Add Twitch channel</label>
          <div className="flex gap-2">
            <Input
              value={newTwitchInput}
              onChange={(e) => setNewTwitchInput(e.target.value)}
              placeholder="e.g. ftnmedia or twitch.tv/ftnmedia"
              className="font-mono text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTwitchChannel(e);
              }}
            />
            <Button
              type="button"
              onClick={handleAddTwitchChannel}
              className="font-semibold text-xs px-4 gap-1.5 bg-brand hover:bg-brand-hover text-black font-bold cursor-pointer shadow-sm"
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>
        {twitchChannels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            No Twitch channels added yet.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {twitchChannels.map((channel) => (
              <li key={channel} className="flex items-center gap-4 px-4 py-3">
                <span className="min-w-0 flex-1 truncate font-mono text-sm">{channel}</span>
                <button type="button" onClick={() => setTwitchChannels(twitchChannels.filter((c) => c !== channel))} className="w-8 cursor-pointer p-1 text-neutral-400 transition hover:text-red-500" title="Remove channel">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {sectionFooter("twitch")}
      </AdminSection>
      <AdminSection title="YouTube channels" description="Channels FTN+ ingests from, and where each one may appear.">
        <div className="space-y-3">
          <label className="block text-sm font-semibold">
            Add channel ID or handle
          </label>
          <div className="flex gap-2">
            <Input
              value={newChannelInput}
              onChange={(e) => setNewChannelInput(e.target.value)}
              placeholder="e.g. UCxxxxxxxxxxxxxxxxxxxxxx or @FTNMedia"
              className="font-mono text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddChannel(e);
                }
              }}
            />
            <Button
              type="button"
              onClick={handleAddChannel}
              className="font-semibold text-xs px-4 gap-1.5 bg-brand hover:bg-brand-hover text-black font-bold cursor-pointer shadow-sm"
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <label className="block text-sm font-semibold">
            Active Channel Ingestions ({youtubeChannels.length})
          </label>

          {youtubeChannels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
              No custom channel IDs added yet.
            </div>
          ) : (
            <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              <li className="hidden items-center gap-6 px-4 py-2 text-xs font-bold uppercase tracking-widest text-neutral-500 sm:flex">
                <span className="flex-1">Channel</span>
                <span className="w-24 text-center">Featured</span>
                <span className="w-24 text-center">Trending</span>
                <span className="w-8" />
              </li>
              {youtubeChannels.map((channel, idx) => {
                const isFeaturedHidden = hiddenFeaturedChannels.includes(channel);
                const isTrendingHidden = hiddenTrendingChannels.includes(channel);
                return (
                  <li key={idx} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{channel}</span>
                    <span className="flex w-24 justify-center" title="Show this channel in the FTN and FTN+ featured sections">
                      <AdminSwitch checked={!isFeaturedHidden} onChange={() => handleToggleHideFeatured(channel)} label={`Show ${channel} in featured`} />
                    </span>
                    <span className="flex w-24 justify-center" title="Show this channel in the trending swimlane">
                      <AdminSwitch checked={!isTrendingHidden} onChange={() => handleToggleHideTrending(channel)} label={`Show ${channel} in trending`} />
                    </span>
                    <button type="button" onClick={() => handleRemoveChannel(channel)} className="w-8 cursor-pointer p-1 text-neutral-400 transition hover:text-red-500" title="Delete channel">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      {sectionFooter("channels")}
</AdminSection>

        {/* 5b. Synced Video Library & Stream Visibility Controls */}
      <AdminSection title={<>Video catalog {videosLoaded ? `(${ingestedVideos.length})` : ""}</>} description="Hide duplicate or superseded streams from FTN+ swimlanes and the homepage.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={videoSearchQuery}
            onChange={(e) => {
              setVideoSearchQuery(e.target.value);
              setVisibleVideoCount(24);
            }}
            placeholder="Search by title, channel or video id"
            className="h-10 sm:max-w-sm"
          />
          <AdminSegmented
            value={videoFilter}
            onChange={(v) => { setVideoFilter(v); setVisibleVideoCount(24); }}
            options={[{ value: "all", label: "All" }, { value: "shown", label: "Shown" }, { value: "hidden", label: `Hidden (${ingestedVideos.filter((v) => hiddenVideoIds.includes(v.youtubeId || v.id) || hiddenVideoIds.includes(v.id)).length})` }]}
          />
        </div>

        {loadingVideos && !videosLoaded ? (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-900 dark:bg-neutral-900/50 p-12 text-center text-xs text-neutral-500 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="h-6 w-6 animate-spin text-brand-text" />
            <span>Loading synced video catalog...</span>
          </div>
        ) : (() => {
          const filteredVideos = ingestedVideos.filter((v) =>
            !videoSearchQuery.trim() ||
            (v.title || "").toLowerCase().includes(videoSearchQuery.toLowerCase()) ||
            (v.channelTitle || "").toLowerCase().includes(videoSearchQuery.toLowerCase()) ||
            (v.youtubeId || "").toLowerCase().includes(videoSearchQuery.toLowerCase())
          ).filter((v) => {
            if (videoFilter === "all") return true;
            const hid = hiddenVideoIds.includes(v.youtubeId || v.id) || hiddenVideoIds.includes(v.id);
            return videoFilter === "hidden" ? hid : !hid;
          });
          const displayedVideos = filteredVideos.slice(0, visibleVideoCount);
          const hasMoreVideos = filteredVideos.length > displayedVideos.length;

          if (filteredVideos.length === 0) {
            return (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-900 dark:bg-neutral-900/50 p-6 text-center text-xs text-neutral-500">
                {ingestedVideos.length === 0 ? "No videos ingested yet. Use 'Sync Channels' to populate." : "No videos match your search query."}
              </div>
            );
          }

          return (
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {displayedVideos.map((video) => {
                  const ytid = video.youtubeId || video.id;
                  const isHidden = hiddenVideoIds.includes(ytid) || hiddenVideoIds.includes(video.id);

                  return (
                    <div key={ytid} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                      <div className="relative aspect-video bg-neutral-200 dark:bg-neutral-950">
                        <img
                          src={video.thumbnailUrl || `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`}
                          alt={video.title}
                          loading="lazy"
                          decoding="async"
                          className={`h-full w-full object-cover transition ${isHidden ? "opacity-40 grayscale" : ""}`}
                        />
                        {video.isLive && <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Live</span>}
                        {isHidden && <span className="absolute left-2 bottom-2 rounded-full bg-[#16110a] px-2.5 py-0.5 text-xs font-bold text-[#fff8e6]">Hidden</span>}
                      </div>
                      <div className="space-y-2 p-3">
                        <div className="line-clamp-2 text-sm font-bold leading-snug" title={video.title}>{video.title}</div>
                        <div className="truncate text-xs text-neutral-500">{video.channelTitle || "FTN"}</div>
                        <div className="flex items-center justify-between border-t border-neutral-200 pt-2 dark:border-neutral-800">
                          <label className="flex items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                            <AdminSwitch checked={!isHidden} onChange={() => handleToggleHideVideo(ytid)} label={isHidden ? "Show video" : "Hide video"} />
                            {isHidden ? "Hidden" : "Shown"}
                          </label>
                          <span className="flex items-center gap-1">
                            <a href={`https://www.youtube.com/watch?v=${ytid}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-neutral-500 transition hover:text-black dark:hover:text-white" title="Watch on YouTube">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            <button type="button" disabled={deletingVideoId === ytid} onClick={() => handleDeleteVideo(ytid, video.title)} className="cursor-pointer p-1.5 text-neutral-400 transition hover:text-red-500 disabled:opacity-50" title="Delete completely">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progressive Load More Footer */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
                <span>
                  Showing {displayedVideos.length} of {filteredVideos.length} video{filteredVideos.length === 1 ? "" : "s"}
                  {filteredVideos.length < ingestedVideos.length ? ` (filtered from ${ingestedVideos.length})` : ""}
                </span>
                {hasMoreVideos && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setVisibleVideoCount((prev) => prev + 24)}
                    className="text-xs h-7 px-3 border-neutral-300 text-neutral-800 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-200 dark:hover:text-white cursor-pointer"
                  >
                    Load more
                  </Button>
                )}
              </div>
            </div>
          );
        })()}
      {sectionFooter("catalog")}
</AdminSection>

      {/* 6. Custom FTN+ Swimlanes (Dynamic Filter & Curated Playlist) */}
      <AdminSection title="Swimlanes" description="Custom rows of videos on the FTN+ home page.">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-neutral-500">Use the arrows to choose which lane appears first on FTN+.</p>
          <Button type="button" size="sm" onClick={() => setNewSwimlaneOpen(true)} className="h-10 shrink-0 cursor-pointer bg-brand px-5 text-sm font-bold text-brand-ink shadow-sm hover:bg-brand-hover">
            New swimlane
          </Button>
        </div>

        {/* Configured Swimlanes List with Reordering */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">Configured swimlanes ({swimlanes.length})</div>

          {swimlanes.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-900 dark:bg-neutral-900/50 p-4 text-center text-xs text-neutral-500">
              No custom swimlanes configured. Only the main Trending lane will be displayed.
            </div>
          ) : (
            <div className="space-y-2">
              {swimlanes.map((lane, index) => (
                <div
                  key={lane.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 px-4 py-3 hover:border-neutral-300 dark:hover:border-neutral-700 transition shadow-sm dark:shadow-none"
                >
                  <div className="flex items-center gap-3">
                    {/* Reorder Buttons */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMoveSwimlane(index, "up")}
                        className="p-0.5 text-neutral-400 hover:text-black dark:hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                        title="Move Up"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={index === swimlanes.length - 1}
                        onClick={() => handleMoveSwimlane(index, "down")}
                        className="p-0.5 text-neutral-400 hover:text-black dark:hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                        title="Move Down"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                        <span>{lane.title}</span>
                        {lane.type === "playlist" ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300 text-[9px] font-bold flex items-center gap-1">
                            <ListVideo className="h-2.5 w-2.5" /> PLAYLIST ({lane.playlistVideos?.length || 0})
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-brand/20 border border-brand text-brand-text text-[9px] font-bold flex items-center gap-1">
                            <Sliders className="h-2.5 w-2.5" /> FILTER
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
                        {lane.type === "playlist" ? (
                          <span>{lane.playlistVideos?.length || 0} curated videos</span>
                        ) : (
                          <>
                            {lane.channel && (
                              <span>
                                Channels: <strong className="text-neutral-800 dark:text-neutral-200">{lane.channel}</strong>
                              </span>
                            )}
                            {lane.channel && lane.regexPattern && <span>•</span>}
                            {lane.regexPattern && (
                              <span>
                                Keywords: <strong className="text-neutral-800 dark:text-neutral-200">{lane.regexPattern}</strong>
                              </span>
                            )}
                          </>
                        )}
                        <span>•</span>
                        <span>
                          Sort:{" "}
                          {lane.sortBy === "trending"
                            ? "7-Day Trending"
                            : lane.sortBy === "curated"
                            ? "Curated Order"
                            : "Most Recent"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingSwimlane(lane)}
                      className="text-neutral-400 hover:text-brand-text transition p-1.5 cursor-pointer"
                      title="Edit Swimlane"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSwimlane(lane.id)}
                      className="text-neutral-400 hover:text-red-500 transition p-1.5 cursor-pointer"
                      title="Delete Swimlane"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {editingSwimlane && (
          <AdminDrawer title={`Edit swimlane: ${editingSwimlane.title || "untitled"}`} wide onClose={() => setEditingSwimlane(null)}>

          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                <Edit2 className="h-3.5 w-3.5" /> Editing Swimlane: {editingSwimlane.title}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingSwimlane(null)}
                className="text-xs h-7 border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-white cursor-pointer"
              >
                Cancel
              </Button>
            </div>

            <AdminSegmented
              value={editingSwimlane.type === "playlist" ? "playlist" : "filter"}
              onChange={(t) =>
                setEditingSwimlane(
                  t === "playlist"
                    ? { ...editingSwimlane, type: "playlist", playlistVideos: editingSwimlane.playlistVideos || [] }
                    : { ...editingSwimlane, type: "filter" }
                )
              }
              options={[
                { value: "filter", label: <><Sliders className="h-3.5 w-3.5" /> Dynamic filter</> },
                { value: "playlist", label: <><ListVideo className="h-3.5 w-3.5" /> Curated playlist</> },
              ]}
            />

            {editingSwimlane.type === "playlist" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  <Input
                    value={editingSwimlane.title}
                    onChange={(e) => setEditingSwimlane({ ...editingSwimlane, title: e.target.value })}
                    placeholder="Playlist Title (e.g. Investigative Specials)"
                    className="text-xs"
                    required
                  />
                  <Select
                    value={editingSwimlane.sortBy}
                    onChange={(e) =>
                      setEditingSwimlane({ ...editingSwimlane, sortBy: e.target.value as any })
                    }
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                  >
                    <option value="curated">Sort: Curated Order (As Added)</option>
                    <option value="recent">Sort: Most Recent</option>
                    <option value="trending">Sort: 7-Day Trending</option>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold">Add YouTube Video</label>
                  <div className="flex gap-2">
                    <Input
                      value={editingPlaylistVideoUrl}
                      onChange={(e) => setEditingPlaylistVideoUrl(e.target.value)}
                      placeholder="Paste YouTube Video URL (e.g. https://www.youtube.com/watch?v=...)"
                      className="text-xs flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddVideoToEditingPlaylist();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      disabled={addingEditPlaylistVideo || !editingPlaylistVideoUrl.trim()}
                      onClick={handleAddVideoToEditingPlaylist}
                      className="bg-brand hover:bg-brand-hover text-brand-ink font-bold text-xs shrink-0 cursor-pointer shadow-sm"
                    >
                      {addingEditPlaylistVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add Video"}
                    </Button>
                  </div>
                </div>

                {/* Playlist Videos in Edit Mode */}
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {(editingSwimlane.playlistVideos || []).map((video, vIdx) => (
                    <div
                      key={vIdx}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900/80 gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {video.thumbnailUrl && (
                          <img
                            src={video.thumbnailUrl}
                            alt=""
                            className="h-9 w-16 object-cover rounded shrink-0 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">{video.title}</p>
                          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                            {video.channelTitle} • {video.youtubeId}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveVideoFromEditingPlaylist(video.youtubeId)}
                        className="text-neutral-400 hover:text-red-500 p-1 cursor-pointer"
                        title="Remove video from playlist"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  onClick={handleSaveEditedSwimlane}
                  className="bg-brand hover:bg-brand-hover text-brand-ink font-bold text-xs cursor-pointer shadow-sm"
                >
                  Save Playlist Changes
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSaveEditedSwimlane} className="space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <Input
                    value={editingSwimlane.title}
                    onChange={(e) => setEditingSwimlane({ ...editingSwimlane, title: e.target.value })}
                    placeholder="Swimlane Title"
                    className="text-xs"
                    required
                  />
                  <Input
                    value={editingSwimlane.channel || ""}
                    onChange={(e) => setEditingSwimlane({ ...editingSwimlane, channel: e.target.value })}
                    placeholder="Channels (e.g. @FTNtv, @FTNsports)"
                    className="text-xs"
                  />
                  <Input
                    value={editingSwimlane.regexPattern || ""}
                    onChange={(e) => setEditingSwimlane({ ...editingSwimlane, regexPattern: e.target.value })}
                    placeholder="Keywords (e.g. report|live)"
                    className="font-mono text-xs"
                  />
                  <div className="flex gap-2">
                    <Select
                      value={editingSwimlane.sortBy}
                      onChange={(e) => setEditingSwimlane({ ...editingSwimlane, sortBy: e.target.value as any })}
                      className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                    >
                      <option value="recent">Sort: Most Recent</option>
                      <option value="trending">Sort: 7-Day Trending</option>
                    </Select>
                    <Button type="submit" size="sm" className="bg-brand hover:bg-brand-hover text-brand-ink font-bold text-xs shrink-0 cursor-pointer shadow-sm">
                      Save
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>

          </AdminDrawer>
        )}

        {newSwimlaneOpen && !editingSwimlane && (
          <AdminDrawer title="New swimlane" wide onClose={() => setNewSwimlaneOpen(false)}>

          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-bold text-neutral-900 dark:text-white">Add New Swimlane</span>
              <AdminSegmented
                value={newSwimlaneType}
                onChange={setNewSwimlaneType}
                options={[
                  { value: "filter", label: <><Sliders className="h-3 w-3" /> Dynamic filter</> },
                  { value: "playlist", label: <><ListVideo className="h-3 w-3" /> Curated playlist</> },
                ]}
              />
            </div>

            {newSwimlaneType === "playlist" ? (
              <form onSubmit={handleAddSwimlane} className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Playlist Title</label>
                    <Input
                      value={newSwimlaneTitle}
                      onChange={(e) => setNewSwimlaneTitle(e.target.value)}
                      placeholder="e.g. Best of FTN Television 2026"
                      className="text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Sort Order</label>
                    <Select
                      value={newSwimlaneSort}
                      onChange={(e) => setNewSwimlaneSort(e.target.value as any)}
                      className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                    >
                      <option value="curated">Curated Order (As Added)</option>
                      <option value="recent">Most Recent</option>
                      <option value="trending">7-Day Trending</option>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold">Add YouTube Video</label>
                  <div className="flex gap-2">
                    <Input
                      value={newPlaylistVideoUrl}
                      onChange={(e) => setNewPlaylistVideoUrl(e.target.value)}
                      placeholder="Paste YouTube Video URL or ID (e.g. https://www.youtube.com/watch?v=...)"
                      className="text-xs flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddVideoToNewPlaylist();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      disabled={addingPlaylistVideo || !newPlaylistVideoUrl.trim()}
                      onClick={handleAddVideoToNewPlaylist}
                      className="bg-brand hover:bg-brand-hover text-black font-bold text-xs shrink-0 cursor-pointer shadow-sm"
                    >
                      {addingPlaylistVideo ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Resolving Title...
                        </>
                      ) : (
                        "Add Video"
                      )}
                    </Button>
                  </div>
                </div>

                {/* Added Videos Preview */}
                {newPlaylistVideos.length > 0 && (
                  <div className="space-y-2 p-3 rounded-lg bg-neutral-100 dark:bg-black/40 border border-neutral-200 dark:border-neutral-800">
                    <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">
                      Playlist Videos ({newPlaylistVideos.length})
                    </span>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {newPlaylistVideos.map((video, vIdx) => (
                        <div
                          key={vIdx}
                          className="flex items-center justify-between p-2 rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {video.thumbnailUrl && (
                              <img
                                src={video.thumbnailUrl}
                                alt=""
                                className="h-9 w-16 object-cover rounded shrink-0 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">{video.title}</p>
                              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                                {video.channelTitle} • {video.youtubeId}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveVideoFromNewPlaylist(video.youtubeId)}
                            className="text-neutral-400 hover:text-red-500 p-1 cursor-pointer"
                            title="Remove video from playlist"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={newPlaylistVideos.length === 0 || !newSwimlaneTitle.trim()}
                  className="bg-brand hover:bg-brand-hover text-black font-bold text-xs cursor-pointer shadow-sm"
                >
                  Create Playlist Swimlane
                </Button>
              </form>
            ) : (
              /* Dynamic Filter Form */
              <form onSubmit={handleAddSwimlane} className="space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <Input
                    value={newSwimlaneTitle}
                    onChange={(e) => setNewSwimlaneTitle(e.target.value)}
                    placeholder="Swimlane Title (e.g. Channel Exclusive)"
                    className="text-xs"
                    required
                  />
                  <Input
                    value={newSwimlaneChannel}
                    onChange={(e) => setNewSwimlaneChannel(e.target.value)}
                    placeholder="Channels (e.g. @FTNtv, @FTNsports)"
                    className="text-xs"
                  />
                  <Input
                    value={newSwimlaneRegex}
                    onChange={(e) => setNewSwimlaneRegex(e.target.value)}
                    placeholder="Filter Keywords (e.g. report|live)"
                    className="font-mono text-xs"
                  />
                  <div className="flex gap-2">
                    <Select
                      value={newSwimlaneSort}
                      onChange={(e) => setNewSwimlaneSort(e.target.value as any)}
                      className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                    >
                      <option value="recent">Sort: Most Recent</option>
                      <option value="trending">Sort: 7-Day Trending</option>
                    </Select>
                    <Button
                      type="submit"
                      size="sm"
                      className="bg-brand hover:bg-brand-hover text-black font-bold text-xs shrink-0 cursor-pointer shadow-sm"
                    >
                      Add Lane
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Multiple channels can be comma-separated. Keywords match case-insensitively using pipe &quot;|&quot; (e.g. report|broadcast|special).
                </p>
              </form>
            )}
          </div>

          </AdminDrawer>
        )}
      {sectionFooter("swimlanes")}
</AdminSection>
    </div>
  )}
      <AdminSaveBar changed={changedLabels} dirty={dirty} saving={isSavingConfig} saved={savedSuccess} onSave={handleSaveAllSettings} onDiscard={async () => { if (await confirmDialog("Throw away your unsaved changes?")) window.location.reload(); }} />
    </div>
    </AdminAuthGuard>
  );
}
