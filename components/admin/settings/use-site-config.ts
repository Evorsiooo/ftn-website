"use client";
import { useEffect, useRef, useState } from "react";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import { canConfigureSite } from "@/lib/rbac";
import { fetchSession } from "@/lib/session-client";

export interface PlaylistVideo {
  youtubeId: string;
  title: string;
  thumbnailUrl?: string;
  channelTitle?: string;
}

export interface CustomSwimlane {
  id: string;
  title: string;
  type?: "filter" | "playlist";
  channel?: string;
  channelIds?: string[];
  regexPattern?: string;
  sortBy: "recent" | "trending" | "curated";
  playlistVideos?: PlaylistVideo[];
}

export interface SocialLink {
  id: string;
  name: string;
  url: string;
}

/**
 * The site configuration behind Settings, People (moderation rules, staff accounts) and FTN+ content:
 * one loaded copy, a saved baseline, and per-section save/revert. Moved here unchanged from the old
 * single settings page so all three pages save exactly as before.
 */
export function useSiteConfig(opts: { people?: boolean; videos?: boolean } = {}) {
  // Webradio
  const [streamUrlInput, setStreamUrlInput] = useState("https://icecast.ftnmedia.org/live.mp3");
  const [statusJsonInput, setStatusJsonInput] = useState("https://icecast.ftnmedia.org/status-json.xsl");
  const [webradioToggle, setWebradioToggle] = useState(true);
  const [radioPublic, setRadioPublic] = useState({
    stationName: "FTN Radio",
    songDetection: true,
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
  const [reportsAccess, setReportsAccess] = useState<"public" | "members_only" | "off">("public");

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

  // Managers only get the Moderation page (mutes); everything else here is for Site Administrators.
  const [isSiteAdmin, setIsSiteAdmin] = useState(false);
  useEffect(() => {
    fetchSession().then((d: any) => setIsSiteAdmin(canConfigureSite(d?.user?.roles ?? []))).catch(() => {});
  }, []);


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
    streamUrlInput, statusJsonInput, webradioToggle, allowSignIn, authMode, ftnPlusAccess, tiplineAccess, reportsAccess, discordUrl, socialLinks,
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
    station: { label: "Station & Discord bot", pub: ["stationName", "songDetection", "discordBotLink", "discordBotCommand"] },
    icecast: { label: "Icecast", sec: ["icecastAdminUrl", "icecastUsername", "icecastPassword", "icecastMount"] },
    rotation: { label: "Password rotation", sec: ["rotationEndpointUrl", "rotationEndpointToken", "rotationFrequencyHours", "rotationTimeUtc", "discordWebhookUrl"] },
    art: { label: "Album art", pub: ["defaultArtUrl"], sec: ["lastFmApiKey", "fanartTvApiKey", "artPriority"] },
    signin: { label: "Sign-in", keys: ["allowSignIn", "authMode"] },
    gates: { label: "Access gates", keys: ["ftnPlusAccess", "tiplineAccess", "reportsAccess"] },
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
    ftnPlusAccess: setFtnPlusAccess, tiplineAccess: setTiplineAccess, reportsAccess: setReportsAccess, autoModEnabled: setAutoModEnabled, autoModThreshold: setAutoModThreshold,
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

  /** Saves the given sections together (one request per API), then marks them saved. */
  const saveMany = async (ids: string[]): Promise<boolean> => {
    if (baseline === null || ids.length === 0) return true;
    const secs = ids.map((id) => SECTIONS[id]);
    const now = JSON.parse(payloadJson) as Record<string, any>;
    setSavingSection(ids.length === 1 ? ids[0] : "all");
    try {
      const config: Record<string, unknown> = {};
      for (const sec of secs)
        for (const k of sec.keys ?? []) config[API_KEY[k] ?? k] = k === "autoModThreshold" ? Number(now[k]) : k === "streamUrlInput" || k === "statusJsonInput" || k === "discordUrl" ? String(now[k]).trim() : now[k];
      if (Object.keys(config).length > 0) {
        const res = await fetch("/api/radio/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as any).error || "Save failed");
      }
      const pub = secs.flatMap((s) => s.pub ?? []);
      const sec2 = secs.flatMap((s) => s.sec ?? []);
      if (pub.length || sec2.length) {
        const pick = (obj: Record<string, any> | undefined, ks: string[]) => Object.fromEntries(ks.map((k) => [k, obj?.[k]]));
        const res = await fetch("/api/admin/radio/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public: pick(now.radioPublic, pub), secure: pick(now.radioSecure, sec2) }),
        });
        if (!res.ok) throw new Error("Save failed");
      }
      const next = JSON.parse(baseline) as Record<string, any>;
      for (const sec of secs) {
        for (const k of sec.keys ?? []) next[k] = now[k];
        for (const k of sec.pub ?? []) next.radioPublic = { ...next.radioPublic, [k]: now.radioPublic?.[k] };
        for (const k of sec.sec ?? []) next.radioSecure = { ...next.radioSecure, [k]: now.radioSecure?.[k] };
      }
      setBaseline(JSON.stringify(next));
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
      return true;
    } catch (err: any) {
      toast(err.message || "Could not save.");
      return false;
    } finally {
      setSavingSection(null);
    }
  };
  const saveSection = (id: string) => saveMany([id]);

  const revertSection = (id: string) => {
    if (baseline === null) return;
    const sec = SECTIONS[id];
    const was = JSON.parse(baseline) as Record<string, any>;
    for (const k of sec.keys ?? []) setters[k]?.(was[k]);
    if (sec.pub) setRadioPublic((p) => ({ ...p, ...Object.fromEntries(sec.pub!.map((k) => [k, was.radioPublic?.[k]])) }));
    if (sec.sec) setRadioSecure((p) => ({ ...p, ...Object.fromEntries(sec.sec!.map((k) => [k, was.radioSecure?.[k]])) }));
  };

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
          if (data.reportsAccess) setReportsAccess(data.reportsAccess);
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

    if (!opts.people) {
      return;
    }
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

  // The video catalog is only loaded by the FTN+ content page.
  useEffect(() => {
    if (opts.videos && !videosLoaded) fetchVideosCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.videos, videosLoaded]);

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
          setSyncStatus(`Channel added! ${data.synced || 0} video(s) synced from ${val}. Save to keep the channel.`);
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
        setSyncStatus(`Channel added. Use Sync videos now to bring in its videos.`);
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
          reportsAccess,
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

  return {
    streamUrlInput,
    setStreamUrlInput,
    statusJsonInput,
    setStatusJsonInput,
    webradioToggle,
    setWebradioToggle,
    radioPublic,
    setRadioPublic,
    radioSecure,
    setRadioSecure,
    allowSignIn,
    setAllowSignIn,
    authMode,
    setAuthMode,
    ftnPlusAccess,
    setFtnPlusAccess,
    tiplineAccess,
    setTiplineAccess,
    reportsAccess,
    setReportsAccess,
    userSearchQuery,
    setUserSearchQuery,
    searchedUsers,
    setSearchedUsers,
    searchingUsers,
    setSearchingUsers,
    hasSearched,
    setHasSearched,
    deletingUserId,
    setDeletingUserId,
    newEmployeeUsername,
    setNewEmployeeUsername,
    creatingEmployee,
    setCreatingEmployee,
    createdEmployeeResult,
    setCreatedEmployeeResult,
    editingUsernameUserId,
    setEditingUsernameUserId,
    newUsernameInput,
    setNewUsernameInput,
    updatingUsername,
    setUpdatingUsername,
    resettingPasswordUserId,
    setResettingPasswordUserId,
    resetPasswordResult,
    setResetPasswordResult,
    copiedCredential,
    setCopiedCredential,
    discordUrl,
    setDiscordUrl,
    socialLinks,
    setSocialLinks,
    newSocialName,
    setNewSocialName,
    newSocialUrl,
    setNewSocialUrl,
    bannedWordsInput,
    setBannedWordsInput,
    isSiteAdmin,
    setIsSiteAdmin,
    youtubeChannels,
    setYoutubeChannels,
    newChannelInput,
    setNewChannelInput,
    twitchChannels,
    setTwitchChannels,
    newTwitchInput,
    setNewTwitchInput,
    hiddenFeaturedChannels,
    setHiddenFeaturedChannels,
    hiddenTrendingChannels,
    setHiddenTrendingChannels,
    hiddenVideoIds,
    setHiddenVideoIds,
    ingestedVideos,
    setIngestedVideos,
    videoSearchQuery,
    setVideoSearchQuery,
    videoFilter,
    setVideoFilter,
    newSwimlaneOpen,
    setNewSwimlaneOpen,
    deletingVideoId,
    setDeletingVideoId,
    loadingVideos,
    setLoadingVideos,
    videosLoaded,
    setVideosLoaded,
    visibleVideoCount,
    setVisibleVideoCount,
    swimlanes,
    setSwimlanes,
    newSwimlaneType,
    setNewSwimlaneType,
    newSwimlaneTitle,
    setNewSwimlaneTitle,
    newSwimlaneChannel,
    setNewSwimlaneChannel,
    newSwimlaneRegex,
    setNewSwimlaneRegex,
    newSwimlaneSort,
    setNewSwimlaneSort,
    newPlaylistVideos,
    setNewPlaylistVideos,
    newPlaylistVideoUrl,
    setNewPlaylistVideoUrl,
    addingPlaylistVideo,
    setAddingPlaylistVideo,
    editingSwimlane,
    setEditingSwimlane,
    editingPlaylistVideoUrl,
    setEditingPlaylistVideoUrl,
    addingEditPlaylistVideo,
    setAddingEditPlaylistVideo,
    registeredUsers,
    setRegisteredUsers,
    moderations,
    setModerations,
    selectedUserToMute,
    setSelectedUserToMute,
    muteDuration,
    setMuteDuration,
    muteReason,
    setMuteReason,
    autoModEnabled,
    setAutoModEnabled,
    donationBannerEnabled,
    setDonationBannerEnabled,
    autoModThreshold,
    setAutoModThreshold,
    autoModMuteDuration,
    setAutoModMuteDuration,
    isSavingConfig,
    setIsSavingConfig,
    savedSuccess,
    setSavedSuccess,
    isSyncingVideos,
    setIsSyncingVideos,
    syncStatus,
    setSyncStatus,
    purgingVideos,
    setPurgingVideos,
    configLoaded,
    setConfigLoaded,
    baseline,
    setBaseline,
    savingSection,
    setSavingSection,
    swimlaneCount,
    payloadJson,
    dirty,
    SECTIONS,
    API_KEY,
    setters,
    dirtySections,
    changedLabels,
    saveMany,
    saveSection,
    revertSection,
    fetchVideosCatalog,
    handleSearchUsers,
    handleCreateEmployee,
    handleResetPassword,
    handleUpdateUsername,
    handleDeleteUser,
    handleCopyCredentials,
    fetchModerations,
    handleAddChannel,
    handleAddTwitchChannel,
    handleRemoveChannel,
    handleToggleHideFeatured,
    handleToggleHideTrending,
    handleAddSocialLink,
    handleRemoveSocialLink,
    extractYouTubeId,
    fetchYouTubeVideoMeta,
    handleAddVideoToNewPlaylist,
    handleRemoveVideoFromNewPlaylist,
    handleAddVideoToEditingPlaylist,
    handleRemoveVideoFromEditingPlaylist,
    handleMoveSwimlane,
    handleAddSwimlane,
    handleSaveEditedSwimlane,
    handleRemoveSwimlane,
    handleMuteUser,
    handleUnmuteUser,
    handlePurgeDummyVideos,
    handleToggleHideVideo,
    handleDeleteVideo,
    handleSaveAllSettings,
    handleTriggerSync,
  };
}

export type SiteConfig = ReturnType<typeof useSiteConfig>;
