"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAudio } from "@/lib/audio-context";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { canConfigureSite } from "@/lib/rbac";
import {
  Play,
  Pause,
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
  const { isPlaying, togglePlay, setStreamUrl, webradioEnabled, setWebradioEnabled } = useAudio();

  // Webradio
  const [streamUrlInput, setStreamUrlInput] = useState("https://icecast.ftnmedia.org/live.mp3");
  const [statusJsonInput, setStatusJsonInput] = useState("https://icecast.ftnmedia.org/status-json.xsl");
  const [webradioToggle, setWebradioToggle] = useState(true);

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

  // YouTube Channels & Video Management
  const [youtubeChannels, setYoutubeChannels] = useState<string[]>([]);
  const [newChannelInput, setNewChannelInput] = useState("");
  const [hiddenVideoIds, setHiddenVideoIds] = useState<string[]>([]);
  const [ingestedVideos, setIngestedVideos] = useState<any[]>([]);
  const [videoSearchQuery, setVideoSearchQuery] = useState("");
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  // Custom Swimlanes
  const [swimlanes, setSwimlanes] = useState<CustomSwimlane[]>([]);
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
  const [autoModThreshold, setAutoModThreshold] = useState(3);
  const [autoModMuteDuration, setAutoModMuteDuration] = useState<"24h" | "1w" | "1m" | "indefinite">("24h");

  // Statuses
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSyncingVideos, setIsSyncingVideos] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [purgingVideos, setPurgingVideos] = useState(false);

  useEffect(() => {
    // 1. Fetch site config
    fetch("/api/radio/config")
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
          if (Array.isArray(data.customSwimlanes)) setSwimlanes(data.customSwimlanes);
          if (Array.isArray(data.hiddenVideoIds)) setHiddenVideoIds(data.hiddenVideoIds);
          if (data.autoModEnabled !== undefined) setAutoModEnabled(data.autoModEnabled);
          if (data.autoModThreshold !== undefined) setAutoModThreshold(data.autoModThreshold);
          if (data.autoModMuteDuration) setAutoModMuteDuration(data.autoModMuteDuration);
        }
      })
      .catch(() => {});

    // 2. Fetch all ingested videos for video management
    fetch("/api/plus/videos")
      .then((res) => res.json())
      .then((data: any) => {
        if (data && Array.isArray(data.videos)) {
          setIngestedVideos(data.videos);
        }
      })
      .catch(() => {});

    // 3. Fetch registered users for moderation dropdown
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
        alert(`Error creating employee: ${data.error || "Failed"}`);
      }
    } catch {
      alert("Network error while creating employee account.");
    } finally {
      setCreatingEmployee(false);
    }
  };

  const handleResetPassword = async (userId: string, username: string) => {
    if (!confirm(`Generate a new password for @${username}?`)) return;

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
        alert(`Failed to reset password: ${data.error || "Error"}`);
      }
    } catch {
      alert("Error resetting password.");
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
        alert(`Failed to update username: ${data.error || "Error"}`);
      }
    } catch {
      alert("Error updating username.");
    } finally {
      setUpdatingUsername(false);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`Are you sure you want to permanently delete the user account @${username}?`)) return;

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
        alert(`Failed to delete user: ${data.error || "Error"}`);
      }
    } catch {
      alert("Error deleting user.");
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
          fetch("/api/plus/videos")
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

  const handleRemoveChannel = (ch: string) => {
    setYoutubeChannels(youtubeChannels.filter((c) => c !== ch));
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
      alert("Please enter a valid YouTube video URL or 11-character video ID.");
      return;
    }
    if (newPlaylistVideos.some((v) => v.youtubeId === ytid)) {
      alert("This video is already in the playlist.");
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
      alert("Please enter a valid YouTube video URL or 11-character video ID.");
      return;
    }
    const currentList = editingSwimlane.playlistVideos || [];
    if (currentList.some((v) => v.youtubeId === ytid)) {
      alert("This video is already in the playlist.");
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
      alert("Please add at least one YouTube video to your curated playlist.");
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
      alert("Please select a user to moderate.");
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
        alert("User muted successfully.");
      } else {
        const d = (await res.json()) as any;
        alert(d.error || "Failed to moderate user.");
      }
    } catch {
      alert("Error applying moderation.");
    }
  };

  const handleUnmuteUser = async (id: string) => {
    if (!confirm("Are you sure you want to unmute this user?")) return;
    try {
      const res = await fetch(`/api/admin/moderation?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchModerations();
      }
    } catch {
      alert("Error unmuting user.");
    }
  };

  const handlePurgeDummyVideos = async () => {
    if (!confirm("This will remove all boilerplate demo videos from the database. Real synced YouTube videos will be kept. Proceed?")) return;
    setPurgingVideos(true);
    try {
      const res = await fetch("/api/radio/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge_dummy_videos" }),
      });
      if (res.ok) {
        alert("Demo videos purged from library.");
      }
    } catch {
      alert("Failed to purge demo videos.");
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
    if (!confirm(`Are you sure you want to completely remove "${title}" from the FTN+ database?\n\nIt will also be hidden so it does not reappear on future channel syncs.`)) {
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
        alert(`Video "${title}" removed from FTN+ library.`);
      } else {
        alert("Failed to delete video.");
      }
    } catch {
      alert("Error deleting video.");
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
          customSwimlanes: swimlanes,
          hiddenVideoIds,
          autoModEnabled,
          autoModThreshold: Number(autoModThreshold),
          autoModMuteDuration,
        }),
      });

      if (res.ok) {
        setStreamUrl(streamUrlInput.trim());
        setWebradioEnabled(webradioToggle);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        alert("Failed to save site configuration.");
      }
    } catch (err) {
      alert("Error saving configuration.");
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
        fetch("/api/plus/videos")
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

  return (
    <AdminAuthGuard requiredPermission={canConfigureSite} featureTitle="Site Settings & Configuration">
      <div className="container mx-auto max-w-5xl px-4 sm:px-8 py-10 space-y-8 text-neutral-900 dark:text-white">
      {/* Top Header with Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white flex items-center gap-2.5">
            <Sliders className="h-7 w-7 text-[#00a9d2]" /> Site Settings & Configuration
          </h1>
        </div>

        <Button
          onClick={handleSaveAllSettings}
          disabled={isSavingConfig}
          className="bg-[#00a9d2] hover:bg-[#0090b3] text-white font-bold text-xs gap-1.5 cursor-pointer shadow-sm"
        >
          {isSavingConfig ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving Changes...
            </>
          ) : savedSuccess ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-950" /> Configuration Saved!
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" /> Save All Settings
            </>
          )}
        </Button>
      </div>

      {/* 1. Webradio Stream Settings */}
      <Card className="p-6 sm:p-8 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none space-y-6">
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-[#00a9d2]" />
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">FTN Live WebRadio Broadcasts</h2>
          </div>

          <div className="flex items-center rounded-lg border border-neutral-300 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 p-1">
            <button
              type="button"
              onClick={() => setWebradioToggle(true)}
              className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                webradioToggle
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              ON
            </button>
            <button
              type="button"
              onClick={() => setWebradioToggle(false)}
              className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                !webradioToggle
                  ? "bg-red-600 text-white shadow-sm"
                  : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              OFF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
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
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
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

        {/* Live Audio Player Test */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/60 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#00a9d2] text-white flex items-center justify-center font-black">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-neutral-900 dark:text-white">Test Stream Playback</div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono truncate max-w-sm">
                {streamUrlInput}
              </div>
            </div>
          </div>

          <Button
            type="button"
            onClick={togglePlay}
            disabled={!webradioToggle}
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-700 dark:bg-neutral-800 dark:text-white cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5 text-[#00a9d2]" /> Pause Test Stream
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Play Test Stream
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* 2. Access Control, Authentication Mode & User Management */}
      <Card className="p-6 sm:p-8 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none space-y-6">
        <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <Lock className="h-4 w-4 text-[#00a9d2]" />
          <h2 className="text-base font-bold text-neutral-900 dark:text-white">Authentication & Access Control</h2>
        </div>

        <div className="space-y-6">
          {/* Account Creation Toggle */}
          <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
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

            <div className="flex items-center rounded-lg border border-neutral-300 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 p-1">
              <button
                type="button"
                disabled={authMode === "credentials"}
                onClick={() => {
                  if (authMode !== "credentials") setAllowSignIn(true);
                }}
                className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                  authMode === "credentials"
                    ? "opacity-30 cursor-not-allowed text-neutral-400"
                    : allowSignIn
                    ? "bg-emerald-600 text-white shadow-sm cursor-pointer"
                    : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white cursor-pointer"
                }`}
              >
                ENABLED
              </button>
              <button
                type="button"
                onClick={() => setAllowSignIn(false)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  !allowSignIn || authMode === "credentials"
                    ? "bg-red-600 text-white shadow-sm"
                    : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                DISABLED
              </button>
            </div>
          </div>

          {/* Authentication Method Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Active Authentication Method
              </label>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {authMode === "roblox"
                  ? "Roblox OAuth 2.0: Visitors and staff log in directly using official Roblox OpenID OAuth."
                  : "Password / Username Mode: Direct Username & Password login. Accounts are provisioned below."}
              </p>
            </div>

            <div className="flex items-center rounded-lg border border-neutral-300 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 p-1 shrink-0">
              <button
                type="button"
                onClick={() => setAuthMode("roblox")}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                  authMode === "roblox"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                Roblox OAuth 2.0
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("credentials");
                  setAllowSignIn(false);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                  authMode === "credentials"
                    ? "bg-[#00a9d2] text-white shadow-sm"
                    : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                Password / Username Mode
              </button>
            </div>
          </div>

          {/* FTN+ Access Gate */}
          <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                FTN+ Access Gate
              </label>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {ftnPlusAccess === "public"
                  ? "Public: Anyone can browse and watch FTN+ videos."
                  : "Members Only: Visitors must authenticate with Roblox to enter FTN+."}
              </p>
            </div>

            <div className="flex items-center rounded-lg border border-neutral-300 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 p-1 shrink-0">
              <button
                type="button"
                onClick={() => setFtnPlusAccess("public")}
                className={`flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  ftnPlusAccess === "public"
                    ? "bg-[#FFBB14] text-black shadow-sm"
                    : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                <Globe className="h-3 w-3" /> Public
              </button>
              <button
                type="button"
                onClick={() => setFtnPlusAccess("members_only")}
                className={`flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  ftnPlusAccess === "members_only"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                <Lock className="h-3 w-3" /> Members Only
              </button>
            </div>
          </div>

          {/* Tipline Access Gate */}
          <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Investigative Tipline Access Gate
              </label>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {tiplineAccess === "public"
                  ? "Public: Anyone can submit news tips anonymously or with their Roblox username."
                  : "Members Only: Visitors must be logged in to submit leads on the tipline."}
              </p>
            </div>

            <div className="flex items-center rounded-lg border border-neutral-300 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 p-1 shrink-0">
              <button
                type="button"
                onClick={() => setTiplineAccess("public")}
                className={`flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  tiplineAccess === "public"
                    ? "bg-[#00a9d2] text-white shadow-sm"
                    : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                <Globe className="h-3 w-3" /> Public
              </button>
              <button
                type="button"
                onClick={() => setTiplineAccess("members_only")}
                className={`flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  tiplineAccess === "members_only"
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                <Lock className="h-3 w-3" /> Members Only
              </button>
            </div>
          </div>

          {/* If Roblox Mode: Informative Notice */}
          {authMode === "roblox" && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/30 p-4 text-xs text-neutral-600 dark:text-neutral-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <strong className="text-neutral-900 dark:text-white">Roblox OAuth 2.0 Active</strong>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  User accounts and usernames are authenticated via Roblox OpenID. To configure permissions or assign division roles, use the Staff Roles console.
                </p>
              </div>
              <Link href="/admin/roles">
                <Button size="sm" variant="outline" className="text-xs border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-800 shrink-0 cursor-pointer">
                  <Shield className="h-3.5 w-3.5 mr-1 text-blue-500" /> Open Roles Console
                </Button>
              </Link>
            </div>
          )}

          {/* If Password Mode: Add Employee / Provision Password Form */}
          {authMode === "credentials" && (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-[#00a9d2]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white">
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
                  className="bg-[#00a9d2] hover:bg-[#0090b3] text-white font-bold text-xs shrink-0 cursor-pointer shadow-sm"
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
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden border border-emerald-500 dark:border-emerald-700">
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
                      <div className="text-xs font-mono font-bold text-[#00a9d2]">
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
            <div className="rounded-xl border border-[#00a9d2]/60 bg-cyan-50 dark:bg-cyan-950/30 p-4 space-y-2">
              <div className="text-xs font-bold text-[#00a9d2]">New Password Generated</div>
              <div className="p-2 rounded bg-white dark:bg-black/60 font-mono text-xs font-bold text-neutral-900 dark:text-white select-all border border-neutral-200 dark:border-transparent">
                {resetPasswordResult.password}
              </div>
            </div>
          )}

          {/* User Search Bar */}
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
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
                className="text-xs bg-[#00a9d2] hover:bg-[#0090b3] text-white font-bold cursor-pointer shadow-sm"
              >
                {searchingUsers ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
              </Button>
            </form>

            {/* Search Results */}
            {searchingUsers ? (
              <div className="p-8 text-center text-xs text-neutral-500 dark:text-neutral-400">Searching accounts...</div>
            ) : hasSearched && searchedUsers.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-500 rounded-xl border border-neutral-200 bg-white dark:border-neutral-900 dark:bg-neutral-900/30">
                No user accounts found matching &quot;{userSearchQuery}&quot;.
              </div>
            ) : (
              <div className="space-y-2">
                {searchedUsers.map((emp) => (
                  <div
                    key={emp.id}
                    className="p-3.5 rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900/60 shadow-sm dark:shadow-none flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-neutral-300 dark:hover:border-neutral-700 transition"
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
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-[9px] font-bold">
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
                                className="px-2 py-0.5 rounded-full bg-neutral-100 text-[#00a9d2] border border-neutral-200 dark:border-transparent dark:bg-neutral-800 text-[10px] font-semibold"
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
                                className="h-8 text-xs bg-[#00a9d2] text-white font-bold"
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
                            className="h-8 text-xs border-neutral-300 bg-neutral-50 text-[#00a9d2] hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800 cursor-pointer"
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
                            <Shield className="h-3 w-3 mr-1 text-blue-500" /> Manage Roles
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
      </Card>

      {/* 3. Discord & Social Media Links */}
      <Card className="p-6 sm:p-8 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none space-y-6">
        <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <Share2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          <h2 className="text-base font-bold text-neutral-900 dark:text-white">Discord & Social Media Links</h2>
        </div>

        <div className="space-y-6">
          {/* Discord Button URL */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
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
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
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
              <Button type="submit" size="sm" className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-sm">
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
      </Card>

      {/* 4. User Moderation & Auto-Mod */}
      <Card className="p-6 sm:p-8 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none space-y-6">
        <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <UserX className="h-4 w-4 text-red-600 dark:text-red-400" />
          <h2 className="text-base font-bold text-neutral-900 dark:text-white">User Moderation & Auto-Mod</h2>
        </div>

        <div className="space-y-6">
          {/* Manual Mute Form */}
          <form onSubmit={handleMuteUser} className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40 space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white">Moderate Registered User</span>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={selectedUserToMute}
                onChange={(e) => setSelectedUserToMute(e.target.value)}
                className="h-9 rounded-md border border-neutral-300 bg-white text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                required
              >
                <option value="">Select User to Mute...</option>
                {registeredUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} (@{u.robloxUsername})
                  </option>
                ))}
              </select>

              <select
                value={muteDuration}
                onChange={(e) => setMuteDuration(e.target.value as any)}
                className="h-9 rounded-md border border-neutral-300 bg-white text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="24h">Mute for 24 Hours</option>
                <option value="1w">Mute for 1 Week</option>
                <option value="1m">Mute for 1 Month</option>
                <option value="indefinite">Mute Indefinitely</option>
              </select>

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

          {/* Active Mutes List */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              Currently Muted Accounts ({moderations.length})
            </label>

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

          {/* Auto-Moderation Rules */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white">Auto-Moderation (Profanity Violations)</span>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Automatically mutes a user if they repeatedly submit comments tripping the profanity filter.
                </p>
              </div>

              <div className="flex items-center rounded-lg border border-neutral-300 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 p-1">
                <button
                  type="button"
                  onClick={() => setAutoModEnabled(true)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                    autoModEnabled ? "bg-red-600 text-white" : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  ON
                </button>
                <button
                  type="button"
                  onClick={() => setAutoModEnabled(false)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                    !autoModEnabled ? "bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white" : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  OFF
                </button>
              </div>
            </div>

            {autoModEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300">Violation Threshold (Within 5 mins)</label>
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
                  <label className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300">Auto-Mute Penalty Duration</label>
                  <select
                    value={autoModMuteDuration}
                    onChange={(e) => setAutoModMuteDuration(e.target.value as any)}
                    className="w-full h-8 rounded-md border border-neutral-300 bg-white text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value="24h">24 Hours</option>
                    <option value="1w">1 Week</option>
                    <option value="1m">1 Month</option>
                    <option value="indefinite">Indefinite</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 5. FTN+ YouTube Channels & Library Purge */}
      <Card className="p-6 sm:p-8 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-[#FFBB14]" />
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">FTN+ YouTube Channels & Video Sync</h2>
          </div>

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
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncingVideos ? "animate-spin text-[#FFBB14]" : ""}`} />
              {isSyncingVideos ? "Syncing..." : "Sync Channels Now"}
            </Button>
          </div>
        </div>

        {syncStatus && (
          <div className="rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 p-3 text-xs text-neutral-800 dark:text-neutral-300">
            {syncStatus}
          </div>
        )}

        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
            Add Channel ID or Handle
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
              className="font-semibold text-xs px-4 gap-1.5 bg-[#FFBB14] hover:bg-[#e5a710] text-black font-bold cursor-pointer shadow-sm"
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
            Active Channel Ingestions ({youtubeChannels.length})
          </label>

          {youtubeChannels.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-900 dark:bg-neutral-900/50 p-4 text-center text-xs text-neutral-500">
              No custom channel IDs added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {youtubeChannels.map((channel, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 px-4 py-2.5"
                >
                  <span className="font-mono text-xs text-neutral-800 dark:text-neutral-200">{channel}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveChannel(channel)}
                    className="text-neutral-400 hover:text-red-500 transition p-1 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* 5b. Synced Video Library & Stream Visibility Controls */}
      <Card className="p-6 sm:p-8 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-[#FFBB14]" />
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">FTN+ Synced Video Catalog ({ingestedVideos.length})</h2>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Hide duplicate or superseded streams from appearing on FTN+ swimlanes and the homepage.
              </p>
            </div>
          </div>

          <div className="w-full sm:w-64">
            <Input
              value={videoSearchQuery}
              onChange={(e) => setVideoSearchQuery(e.target.value)}
              placeholder="Search synced videos..."
              className="text-xs h-8"
            />
          </div>
        </div>

        {ingestedVideos.filter((v) =>
          !videoSearchQuery.trim() ||
          (v.title || "").toLowerCase().includes(videoSearchQuery.toLowerCase()) ||
          (v.channelTitle || "").toLowerCase().includes(videoSearchQuery.toLowerCase()) ||
          (v.youtubeId || "").toLowerCase().includes(videoSearchQuery.toLowerCase())
        ).length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-900 dark:bg-neutral-900/50 p-6 text-center text-xs text-neutral-500">
            {ingestedVideos.length === 0 ? "No videos ingested yet. Use 'Sync Channels' to populate." : "No videos match your search query."}
          </div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {ingestedVideos
              .filter((v) =>
                !videoSearchQuery.trim() ||
                (v.title || "").toLowerCase().includes(videoSearchQuery.toLowerCase()) ||
                (v.channelTitle || "").toLowerCase().includes(videoSearchQuery.toLowerCase()) ||
                (v.youtubeId || "").toLowerCase().includes(videoSearchQuery.toLowerCase())
              )
              .map((video) => {
                const ytid = video.youtubeId || video.id;
                const isHidden = hiddenVideoIds.includes(ytid) || hiddenVideoIds.includes(video.id);

                return (
                  <div
                    key={ytid}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3 transition ${
                      isHidden
                        ? "border-red-300 bg-red-50 dark:border-red-950/60 dark:bg-red-950/10 opacity-70"
                        : "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/80 hover:border-neutral-300 dark:hover:border-neutral-700"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={video.thumbnailUrl || `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`}
                        alt={video.title}
                        className="h-12 w-20 rounded object-cover shrink-0 border border-neutral-300 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-950"
                      />
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-neutral-900 dark:text-white truncate max-w-md" title={video.title}>
                            {video.title}
                          </span>
                          {video.isLive && (
                            <span className="rounded bg-red-600 px-1.5 py-0.2 text-[9px] font-bold uppercase text-white">
                              LIVE
                            </span>
                          )}
                          {isHidden && (
                            <span className="rounded bg-red-100 border border-red-300 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300 px-1.5 py-0.2 text-[9px] font-bold uppercase">
                              HIDDEN
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
                          <span>{video.channelTitle || "FTN"}</span>
                          <span>•</span>
                          <span className="text-neutral-400 dark:text-neutral-500">{ytid}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <a
                        href={`https://www.youtube.com/watch?v=${ytid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white transition"
                        title="Watch on YouTube"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleHideVideo(ytid)}
                        className={`text-xs h-7 px-2.5 gap-1.5 border-neutral-300 dark:border-neutral-800 cursor-pointer ${
                          isHidden ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/60" : "text-neutral-700 hover:text-black dark:text-neutral-300 dark:hover:text-white"
                        }`}
                      >
                        {isHidden ? (
                          <>
                            <Eye className="h-3 w-3" /> Unhide
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3 w-3" /> Hide
                          </>
                        )}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={deletingVideoId === ytid}
                        onClick={() => handleDeleteVideo(ytid, video.title)}
                        className="text-xs h-7 px-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/60 dark:hover:bg-red-900 dark:text-red-300 dark:border-red-800/60 cursor-pointer"
                        title="Delete completely"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Card>

      {/* 6. Custom FTN+ Swimlanes (Dynamic Filter & Curated Playlist) */}
      <Card className="p-6 sm:p-8 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none space-y-6">
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-[#FFBB14]" />
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">FTN+ Custom Swimlanes</h2>
          </div>
        </div>

        {/* Edit Swimlane Form */}
        {editingSwimlane ? (
          <div className="p-5 rounded-xl border border-blue-300 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-950/20 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingSwimlane({ ...editingSwimlane, type: "filter" })}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
                  editingSwimlane.type !== "playlist"
                    ? "bg-blue-600 text-white border-blue-500"
                    : "bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
                }`}
              >
                <Sliders className="h-3.5 w-3.5" /> Dynamic Filter
              </button>
              <button
                type="button"
                onClick={() =>
                  setEditingSwimlane({
                    ...editingSwimlane,
                    type: "playlist",
                    playlistVideos: editingSwimlane.playlistVideos || [],
                  })
                }
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
                  editingSwimlane.type === "playlist"
                    ? "bg-[#FFBB14] text-black border-[#FFBB14]"
                    : "bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
                }`}
              >
                <ListVideo className="h-3.5 w-3.5" /> Curated Playlist
              </button>
            </div>

            {editingSwimlane.type === "playlist" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    value={editingSwimlane.title}
                    onChange={(e) => setEditingSwimlane({ ...editingSwimlane, title: e.target.value })}
                    placeholder="Playlist Title (e.g. Investigative Specials)"
                    className="text-xs"
                    required
                  />
                  <select
                    value={editingSwimlane.sortBy}
                    onChange={(e) =>
                      setEditingSwimlane({ ...editingSwimlane, sortBy: e.target.value as any })
                    }
                    className="w-full h-9 rounded-md border border-neutral-300 bg-white text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value="curated">Sort: Curated Order (As Added)</option>
                    <option value="recent">Sort: Most Recent</option>
                    <option value="trending">Sort: 7-Day Trending</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300">Add YouTube Video</label>
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
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-sm"
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
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-sm"
                >
                  Save Playlist Changes
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSaveEditedSwimlane} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                    <select
                      value={editingSwimlane.sortBy}
                      onChange={(e) => setEditingSwimlane({ ...editingSwimlane, sortBy: e.target.value as any })}
                      className="w-full h-9 rounded-md border border-neutral-300 bg-white text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <option value="recent">Sort: Most Recent</option>
                      <option value="trending">Sort: 7-Day Trending</option>
                    </select>
                    <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-sm">
                      Save
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* Add New Swimlane Form */
          <div className="p-5 rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white">Add New Swimlane</span>
              <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-900 p-1 rounded-lg border border-neutral-300 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setNewSwimlaneType("filter")}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                    newSwimlaneType === "filter"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
                  }`}
                >
                  <Sliders className="h-3 w-3" /> Dynamic Filter
                </button>
                <button
                  type="button"
                  onClick={() => setNewSwimlaneType("playlist")}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                    newSwimlaneType === "playlist"
                      ? "bg-[#FFBB14] text-black font-bold shadow-sm"
                      : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
                  }`}
                >
                  <ListVideo className="h-3 w-3" /> Curated Playlist
                </button>
              </div>
            </div>

            {newSwimlaneType === "playlist" ? (
              <form onSubmit={handleAddSwimlane} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300">Playlist Title</label>
                    <Input
                      value={newSwimlaneTitle}
                      onChange={(e) => setNewSwimlaneTitle(e.target.value)}
                      placeholder="e.g. Best of FTN Television 2026"
                      className="text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300">Sort Order</label>
                    <select
                      value={newSwimlaneSort}
                      onChange={(e) => setNewSwimlaneSort(e.target.value as any)}
                      className="w-full h-9 rounded-md border border-neutral-300 bg-white text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <option value="curated">Curated Order (As Added)</option>
                      <option value="recent">Most Recent</option>
                      <option value="trending">7-Day Trending</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300">Add YouTube Video</label>
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
                      className="bg-[#FFBB14] hover:bg-[#e5a710] text-black font-bold text-xs shrink-0 cursor-pointer shadow-sm"
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
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
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
                  className="bg-[#FFBB14] hover:bg-[#e5a710] text-black font-bold text-xs cursor-pointer shadow-sm"
                >
                  Create Playlist Swimlane
                </Button>
              </form>
            ) : (
              /* Dynamic Filter Form */
              <form onSubmit={handleAddSwimlane} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                    <select
                      value={newSwimlaneSort}
                      onChange={(e) => setNewSwimlaneSort(e.target.value as any)}
                      className="w-full h-9 rounded-md border border-neutral-300 bg-white text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <option value="recent">Sort: Most Recent</option>
                      <option value="trending">Sort: 7-Day Trending</option>
                    </select>
                    <Button
                      type="submit"
                      size="sm"
                      className="bg-[#FFBB14] hover:bg-[#e5a710] text-black font-bold text-xs shrink-0 cursor-pointer shadow-sm"
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
        )}

        {/* Configured Swimlanes List with Reordering */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              Configured Swimlanes ({swimlanes.length})
            </label>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Use arrows to reorder which swimlane appears first on FTN+.
            </p>
          </div>

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
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 border border-blue-300 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300 text-[9px] font-bold flex items-center gap-1">
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
                      className="text-neutral-400 hover:text-blue-500 transition p-1.5 cursor-pointer"
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
      </Card>

      {/* 7. Comment Profanity Filter */}
      <Card className="p-6 sm:p-8 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none space-y-6">
        <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <Shield className="h-4 w-4 text-red-600 dark:text-red-400" />
          <h2 className="text-base font-bold text-neutral-900 dark:text-white">Comment Profanity Filter</h2>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
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
      </Card>
    </div>
    </AdminAuthGuard>
  );
}
