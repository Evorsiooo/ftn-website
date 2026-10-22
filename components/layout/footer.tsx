"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";

interface SocialLink {
  id: string;
  name: string;
  url: string;
}

import { useSiteConfig } from "@/lib/site-config-context";

export function Footer() {
  const { socialLinks } = useSiteConfig();

  return (
    <footer className="border-t border-neutral-200 bg-neutral-100 py-10 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
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
              <Link href="/plus" className="hover:text-black dark:hover:text-white transition-colors">FTN+</Link>
            </li>
            <li><Link href="/plus/radio" className="hover:text-black dark:hover:text-white transition-colors">Webradio</Link></li>
            <li><Link href="/sports" className="hover:text-black dark:hover:text-white transition-colors">Sports</Link></li>
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
