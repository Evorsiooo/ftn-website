"use client";
import React, { createContext, useContext, useState, useRef, useEffect } from "react";

interface AudioContextType {
  isPlaying: boolean;
  volume: number;
  streamUrl: string;
  webradioEnabled: boolean;
  discordUrl: string;
  socialLinks: Array<{ id: string; name: string; url: string }>;
  nowPlaying: {
    title: string;
    artist: string;
  };
  togglePlay: () => void;
  setVolume: (vol: number) => void;
  setStreamUrl: (url: string) => void;
  setWebradioEnabled: (enabled: boolean) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [streamUrl, setStreamUrlState] = useState("https://icecast.ftnmedia.org/live.mp3");
  const [webradioEnabled, setWebradioEnabledState] = useState(true);
  const [discordUrl, setDiscordUrlState] = useState("https://discord.gg/ftn");
  const [socialLinks, setSocialLinksState] = useState<Array<{ id: string; name: string; url: string }>>([
    { id: "sl-discord", name: "Discord Server", url: "https://discord.gg/ftn" },
    { id: "sl-roblox", name: "Roblox Group", url: "https://www.roblox.com" },
    { id: "sl-youtube", name: "YouTube Channel", url: "https://www.youtube.com" },
  ]);
  const [nowPlaying] = useState({
    title: "FTN Radio Live",
    artist: "24/7 Web Radio Stream",
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load configured stream URL and toggle state on mount
  useEffect(() => {
    try {
      const storedUrl = localStorage.getItem("ftn_radio_stream_url");
      if (storedUrl) {
        setStreamUrlState(storedUrl);
      }
      const storedEnabled = localStorage.getItem("ftn_webradio_enabled");
      if (storedEnabled !== null) {
        setWebradioEnabledState(storedEnabled === "true");
      }
    } catch (e) {
      console.error(e);
    }

    fetch("/api/radio/config")
      .then((res) => res.json())
      .then((data: any) => {
        if (data) {
          if (data.streamUrl) {
            setStreamUrlState(data.streamUrl);
            try {
              localStorage.setItem("ftn_radio_stream_url", data.streamUrl);
            } catch (e) {}
          }
          if (data.webradioEnabled !== undefined) {
            setWebradioEnabledState(data.webradioEnabled);
            try {
              localStorage.setItem("ftn_webradio_enabled", String(data.webradioEnabled));
            } catch (e) {}
          }
          if (data.discordUrl) {
            setDiscordUrlState(data.discordUrl);
          }
          if (Array.isArray(data.socialLinks) && data.socialLinks.length > 0) {
            setSocialLinksState(data.socialLinks);
          }
        }
      })
      .catch(() => {});
  }, []);

  const setStreamUrl = (url: string) => {
    setStreamUrlState(url);
    try {
      localStorage.setItem("ftn_radio_stream_url", url);
    } catch (e) {}

    if (audioRef.current) {
      const wasPlaying = isPlaying;
      audioRef.current.src = url;
      if (wasPlaying) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      }
    }
  };

  const setWebradioEnabled = (enabled: boolean) => {
    setWebradioEnabledState(enabled);
    try {
      localStorage.setItem("ftn_webradio_enabled", String(enabled));
    } catch (e) {}
    if (!enabled && isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const togglePlay = () => {
    if (!webradioEnabled) return;

    if (!audioRef.current && typeof window !== "undefined") {
      audioRef.current = new Audio(streamUrl);
      audioRef.current.volume = volume;
    } else if (audioRef.current && audioRef.current.src !== streamUrl) {
      audioRef.current.src = streamUrl;
    }

    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.warn("Audio playback error (stream may be offline or invalid URL):", err);
          setIsPlaying(false);
        });
    }
  };

  const setVolume = (vol: number) => {
    setVolumeState(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  return (
    <AudioContext.Provider
      value={{
        isPlaying,
        volume,
        streamUrl,
        webradioEnabled,
        discordUrl,
        socialLinks,
        nowPlaying,
        togglePlay,
        setVolume,
        setStreamUrl,
        setWebradioEnabled,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    return {
      isPlaying: false,
      volume: 0.8,
      streamUrl: "https://icecast.ftnmedia.org/live.mp3",
      webradioEnabled: true,
      discordUrl: "https://discord.gg/ftn",
      socialLinks: [
        { id: "sl-discord", name: "Discord Server", url: "https://discord.gg/ftn" },
        { id: "sl-roblox", name: "Roblox Group", url: "https://www.roblox.com" },
        { id: "sl-youtube", name: "YouTube Channel", url: "https://www.youtube.com" },
      ],
      nowPlaying: { title: "FTN Radio Live", artist: "24/7 Web Radio Stream" },
      togglePlay: () => {},
      setVolume: () => {},
      setStreamUrl: () => {},
      setWebradioEnabled: () => {},
    };
  }
  return context;
}
