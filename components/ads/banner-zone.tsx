"use client";
import React, { useState, useEffect } from "react";

export interface BannerZoneProps {
  zone?: string;
  format?: "1024x180" | "512x180";
  className?: string;
}

export function BannerZone({
  zone = "homepage_top",
  format = "1024x180",
  className = "",
}: BannerZoneProps) {
  const [ad, setAd] = useState<any | null>(null);

  useEffect(() => {
    fetch(`/api/ads?zone=${encodeURIComponent(zone)}&format=${encodeURIComponent(format)}`)
      .then((res) => res.json())
      .then((data: any) => {
        if (data && data.ad && data.ad.imageUrl) {
          setAd(data.ad);
        }
      })
      .catch(() => {});
  }, [zone, format]);

  if (!ad) {
    return null;
  }

  const handleClick = () => {
    if (ad.id) {
      fetch(`/api/ads/${ad.id}/click`, { method: "POST" }).catch(() => {});
    }
  };

  const widthClass = format === "1024x180" ? "max-w-[1024px] h-[180px]" : "max-w-[512px] h-[180px]";

  return (
    <div className={`w-full ${widthClass} mx-auto my-4 overflow-hidden rounded-xl bg-neutral-100 border border-neutral-200 dark:bg-neutral-950 dark:border-neutral-850 flex items-center justify-center select-none ${className}`}>
      <a
        href={ad.targetUrl || "#"}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="w-full h-full block"
      >
        <img
          src={ad.imageUrl}
          alt={ad.title || "Sponsored Advertisement"}
          className="w-full h-full object-cover"
        />
      </a>
    </div>
  );
}
