"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

interface SocialLink {
  id: string;
  name: string;
  url: string;
}

interface SiteConfigContextType {
  streamUrl: string;
  webradioEnabled: boolean;
  ftnPlusAccess: "public" | "members_only";
  discordUrl: string;
  socialLinks: SocialLink[];
}

const DEFAULTS: SiteConfigContextType = {
  streamUrl: "https://icecast.ftnmedia.org/live.mp3",
  webradioEnabled: true,
  ftnPlusAccess: "public",
  discordUrl: "https://discord.gg/ftn",
  socialLinks: [
    { id: "sl-discord", name: "Discord Server", url: "https://discord.gg/ftn" },
    { id: "sl-roblox", name: "Roblox Group", url: "https://www.roblox.com" },
    { id: "sl-youtube", name: "YouTube Channel", url: "https://www.youtube.com" },
  ],
};

const SiteConfigContext = createContext<SiteConfigContextType>(DEFAULTS);

export function SiteConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<SiteConfigContextType>(DEFAULTS);

  useEffect(() => {
    fetch("/api/radio/config")
      .then((res) => res.json())
      .then((data: any) => {
        if (!data) return;
        setConfig((prev) => ({
          streamUrl: data.streamUrl || prev.streamUrl,
          webradioEnabled: data.webradioEnabled !== undefined ? data.webradioEnabled : prev.webradioEnabled,
          ftnPlusAccess: data.ftnPlusAccess === "members_only" ? "members_only" : data.ftnPlusAccess === "public" ? "public" : prev.ftnPlusAccess,
          discordUrl: data.discordUrl || prev.discordUrl,
          socialLinks: Array.isArray(data.socialLinks) && data.socialLinks.length > 0 ? data.socialLinks : prev.socialLinks,
        }));
      })
      .catch(() => {});
  }, []);

  return <SiteConfigContext.Provider value={config}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig() {
  return useContext(SiteConfigContext);
}
