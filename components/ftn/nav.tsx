"use client";
import React from "react";
import Link from "next/link";
import { IconArrowLeft, IconMoon, IconSun } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export type NavLink = {
  label: string;
  href: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  /** Desktop: show the icon only (still labelled for assistive tech). */
  iconOnly?: boolean;
};

const glass = "bg-ftn-glass backdrop-blur-xl backdrop-saturate-150 border border-ftn-line ftn-shadow";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function ThemeToggle({ theme, onToggle, className }: { theme: "dark" | "light"; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      className={cn("h-10 w-10 inline-flex items-center justify-center rounded-full text-ftn-text-2 hover:text-ftn-text transition cursor-pointer", focus, className)}
    >
      {theme === "dark" ? <IconSun className="h-[18px] w-[18px]" /> : <IconMoon className="h-[18px] w-[18px]" />}
    </button>
  );
}

function ExitLink({ className }: { className?: string }) {
  // Full load: a soft transition into the heavy public home page can stall behind its server render and look like a dead button.
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional full load, see above
    <a
      href="/"
      aria-label="Exit to FTN Main"
      title="Exit to FTN Main"
      className={cn("h-10 w-10 inline-flex items-center justify-center rounded-full text-ftn-text-2 hover:text-ftn-text transition", focus, className)}
    >
      <IconArrowLeft className="h-[18px] w-[18px]" />
    </a>
  );
}

/** Floating pill at the top on desktop, icon dock at the bottom on phones. */
export function FtnNav({ links, theme, onToggleTheme }: { links: NavLink[]; theme: "dark" | "light"; onToggleTheme: () => void }) {
  return (
    <>
      <nav aria-label="FTN+" className={cn("fixed top-5 left-1/2 -translate-x-1/2 z-40 hidden md:flex items-center gap-1 rounded-full p-1.5", glass)}>
        <Link href="/plus" className={cn("pl-4 pr-3 ftn-display text-xl text-ftn-text rounded-full", focus)} aria-label="FTN+ home">
          ftn<span className="text-brand-text">+</span>
        </Link>
        {links.map((l) => {
          const cls = cn(
            "h-10 inline-flex items-center gap-2 rounded-full text-sm font-semibold transition",
            l.iconOnly ? "w-10 justify-center" : "px-4",
            l.active ? "bg-ftn-text text-ftn-bg" : "text-ftn-text-2 hover:text-ftn-text",
            l.disabled && "opacity-40 pointer-events-none",
            focus
          );
          return (
            <Link key={l.label} href={l.href} aria-label={l.label} aria-current={l.active ? "page" : undefined} className={cls}>
              {l.icon}
              {!l.iconOnly && <span>{l.label}</span>}
            </Link>
          );
        })}
        <span className="mx-1 h-5 w-px bg-ftn-line-strong" aria-hidden />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <ExitLink />
      </nav>

      <div className={cn("fixed top-3 right-3 z-40 flex md:hidden rounded-full p-1", glass)} style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <ExitLink />
      </div>

      <nav
        aria-label="FTN+"
        className={cn("fixed inset-x-3 z-40 flex md:hidden items-center justify-between rounded-full p-1.5", glass)}
        style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {links.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            aria-label={l.label}
            aria-current={l.active ? "page" : undefined}
            className={cn(
              "h-11 flex-1 mx-0.5 inline-flex items-center justify-center rounded-full transition",
              l.active ? "bg-ftn-text text-ftn-bg" : "text-ftn-text-2",
              l.disabled && "opacity-40 pointer-events-none",
              focus
            )}
          >
            {l.icon}
          </Link>
        ))}
      </nav>
    </>
  );
}
