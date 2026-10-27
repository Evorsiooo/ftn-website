"use client";
import React from "react";
import Link from "next/link";
import { useSiteConfig } from "@/lib/site-config-context";
import { plusHref } from "@/lib/plus-links";

const col = "space-y-2 text-sm";
const link = "opacity-75 transition hover:text-brand hover:opacity-100";

export function GsFooter() {
  const { socialLinks } = useSiteConfig();
  return (
    <footer className="bg-[#000] text-[#fff3d6]">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-4 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 space-y-4 md:col-span-1">
          <Link href="/" className="inline-block">
            <img src="/logos/ftn_textwhite_transparent.png" alt="FTN Media" className="h-8 w-auto object-contain" />
          </Link>
          <p className="gs-display max-w-xs text-2xl font-extrabold leading-tight">The leading news source in Ro-States.</p>
        </div>
        <div>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-brand">News</h4>
          <ul className={col}>
            <li><Link href="/" className={link}>Headlines</Link></li>
            <li><Link href="/articles" className={link}>All stories</Link></li>
            <li><Link href="/tips" className={link}>Tipline</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-brand">Watch</h4>
          <ul className={col}>
            <li><Link href={plusHref("/plus", "footer")} className={link}>FTN+</Link></li>
            <li><Link href="/plus/radio" className={link}>Webradio</Link></li>
            <li><Link href="/plus/sports" className={link}>Sports</Link></li>
            <li><Link href="/games" className={link}>Games</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-brand">Follow</h4>
          <ul className={col}>
            {socialLinks.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className={link}>{s.name} ↗</a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs opacity-60 sm:flex-row sm:px-8">
          <p suppressHydrationWarning>© 2026 FTN Media. All rights reserved.</p>
          <p className="flex gap-4">
            <Link href="/privacy" className="hover:text-brand">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-brand">Terms of Service</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
