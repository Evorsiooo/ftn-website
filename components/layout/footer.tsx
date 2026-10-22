"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";

interface SocialLink {
  id: string;
  name: string;
  url: string;
}

import { useSiteConfig } from "@/lib/site-config-context";
import { usePlusNow } from "@/components/plus-promo/plus-now-context";
import { FtnPlusLogo } from "@/components/plus-promo/ftn-plus-logo";
import { plusHref } from "@/lib/plus-links";

const PLUS_TILES = [
  { name: "Watch", sub: "Streams and replays", href: "/plus" },
  { name: "Webradio", sub: "On air 24/7", href: "/plus/radio" },
  { name: "Sports", sub: "Results and calendar", href: "/plus/sports" },
  { name: "Schedule", sub: "What is on, and when", href: "/plus/schedule" },
];

export function Footer() {
  const { socialLinks } = useSiteConfig();
  const { data: plusNow } = usePlusNow();
  const plusLive = plusNow.live.length > 0;

  return (
    <footer className="border-t border-neutral-200 bg-neutral-100 py-10 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
      <div className="container mx-auto max-w-7xl px-4 sm:px-8 mb-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_2fr] gap-6 lg:gap-10 items-center rounded-3xl border border-neutral-200 bg-white p-6 sm:p-7 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-none">
          <div className="space-y-3">
            <FtnPlusLogo className="h-9" />
            <p className="text-base font-bold text-neutral-900 dark:text-white leading-snug">
              There is more than news: livestreams, 24/7 web radio, league sports and replays.
            </p>
            <Link
              href={plusHref("/plus", "footer")}
              className="inline-flex h-10 items-center rounded-lg bg-[#FFBB14] px-5 text-xs font-black text-black shadow-[0px_2px_0px_0px_#FFFFFF40_inset] hover:bg-[#e5a710] transition-colors"
            >
              Open FTN+
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PLUS_TILES.map((t) => (
              <Link
                key={t.name}
                href={plusHref(t.href, "footer")}
                className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition hover:border-[#FFBB14] dark:border-neutral-800 dark:bg-neutral-950"
              >
                <b className="block text-sm text-neutral-900 dark:text-white">{t.name}</b>
                <span className="text-[11px] text-neutral-500">{t.sub}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div className="container mx-auto max-w-7xl px-4 sm:px-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
        <div className="space-y-3">
          <Link href="/" className="inline-block select-none">
            {/* Light Mode Logo */}
            <img
              src="/logos/ftn_text_transparent.png"
              alt="FTN Media"
              className="h-6 sm:h-7 w-auto object-contain dark:hidden"
            />
            {/* Dark Mode Logo */}
            <img
              src="/logos/ftn_textwhite_transparent.png"
              alt="FTN Media"
              className="h-6 sm:h-7 w-auto object-contain hidden dark:block"
            />
          </Link>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 leading-relaxed max-w-xs">
            The leading news source in Ro-States
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-neutral-900 dark:text-white mb-2.5 text-xs uppercase tracking-wider">News</h4>
          <ul className="space-y-1.5 text-xs">
            <li><Link href="/" className="hover:text-black dark:hover:text-white transition-colors">Headlines</Link></li>
            <li><Link href="/articles" className="hover:text-black dark:hover:text-white transition-colors">All Stories</Link></li>
            <li><Link href="/tips" className="hover:text-black dark:hover:text-white transition-colors">Tipline</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-neutral-900 dark:text-white mb-2.5 text-xs uppercase tracking-wider">Entertainment</h4>
          <ul className="space-y-1.5 text-xs">
            <li>
              <Link href={plusHref("/plus", "footer")} className="hover:text-black dark:hover:text-white transition-colors inline-flex items-center gap-1.5">
                FTN+
                {plusLive && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-red-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-600" /> Live
                  </span>
                )}
              </Link>
            </li>
            <li><Link href="/plus/radio" className="hover:text-black dark:hover:text-white transition-colors">Webradio</Link></li>
            <li><Link href="/plus/sports" className="hover:text-black dark:hover:text-white transition-colors">Sports</Link></li>
            <li><Link href="/games" className="hover:text-black dark:hover:text-white transition-colors">Games</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-neutral-900 dark:text-white mb-2.5 text-xs uppercase tracking-wider">Socials</h4>
          <ul className="space-y-1.5 text-xs">
            {socialLinks.map((social) => (
              <li key={social.id}>
                <a
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-black dark:hover:text-white transition-colors flex items-center gap-1"
                >
                  {social.name} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 sm:px-8 mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-500">
        <p suppressHydrationWarning>© 2026 FTN Media. All rights reserved.</p>
        <div className="flex items-center gap-4 text-neutral-500 dark:text-neutral-400">
          <Link href="/privacy" className="hover:text-black dark:hover:text-white transition-colors">
            Privacy Policy
          </Link>
          <span>•</span>
          <Link href="/terms" className="hover:text-black dark:hover:text-white transition-colors">
            Terms of Service
          </Link>
        </div>
      </div>
    </footer>
  );
}
