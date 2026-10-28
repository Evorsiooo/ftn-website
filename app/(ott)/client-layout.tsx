"use client";
import { withThemeTransition } from "@/lib/theme-transition";
import { fetchSession } from "@/lib/session-client";
import React, { useState, useEffect } from "react";
import { FtnNav, type NavLink } from "@/components/ftn/nav";
import { PageTransition } from "@/components/ftn/page-transition";
import { OTTLoader } from "@/components/ott/ott-loader";
import { Button } from "@/components/ftn/ui";
import {
  IconHome,
  IconVideo,
  IconBookmark,
  IconCalendar,
  IconRadio,
  IconTrophy,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { FTNPlusProvider, useFTNPlus } from "@/lib/ftnplus-context";
import { useSiteConfig } from "@/lib/site-config-context";

// The provider sits above the session gate so the library request starts
// immediately, in parallel with the session check, while the splash is shown.
export default function OTTClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FTNPlusProvider>
      <OTTShell>{children}</OTTShell>
    </FTNPlusProvider>
  );
}

function OTTShell({ children }: { children: React.ReactNode }) {
  const { loadingLibrary } = useFTNPlus();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const pathname = usePathname();
  const { webradioEnabled, ftnPlusAccess } = useSiteConfig();

  // Dark is the default; the viewer's choice is remembered on this device.
  useEffect(() => {
    try {
      if (localStorage.getItem("ftnplus_theme") === "light") setTheme("light");
    } catch {}
  }, []);
  const toggleTheme = (origin?: { x: number; y: number }) => {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("ftnplus_theme", next);
    } catch {}
    withThemeTransition(() => setTheme(next), origin);
  };

  // Favicon synchronization (page titles come from each route's metadata)
  useEffect(() => {
    let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = "/logos/ftnplus_favicon.png";

    return () => {
      if (link) {
        link.href = "/logos/ftn_favicon_transparent.png";
      }
    };
  }, [pathname]);

  useEffect(() => {
    // 1. Fetch user session
    fetchSession()
      .then((data: any) => {
        if (data && data.authenticated && data.user) {
          setCurrentUser(data.user);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => setCurrentUser(null))
      .finally(() => setLoadingSession(false));

  }, []);

  const isActive = (href: string) => (href === "/plus" ? pathname === "/plus" : href !== "#" && pathname.startsWith(href));
  const icon = "h-[18px] w-[18px] flex-shrink-0";
  const links: NavLink[] = [
    { label: "Home", href: "/plus", icon: <IconHome className={icon} />, active: isActive("/plus") },
    { label: "Library", href: "/plus/library", icon: <IconVideo className={icon} />, active: isActive("/plus/library") },
    { label: "Schedule", href: "/plus/schedule", icon: <IconCalendar className={icon} />, active: isActive("/plus/schedule") },
    {
      label: "Webradio",
      href: webradioEnabled ? "/plus/radio" : "#",
      icon: <IconRadio className={icon} />,
      active: webradioEnabled && isActive("/plus/radio"),
      disabled: !webradioEnabled,
    },
    { label: "Sports", href: "/plus/sports", icon: <IconTrophy className={icon} />, active: isActive("/plus/sports") },
    { label: "Saved", href: "/plus/watchlist", icon: <IconBookmark className={icon} />, active: isActive("/plus/watchlist"), iconOnly: true },
  ];

  // The player is always dark and has its own back button, so it gets no nav and ignores the theme.
  // "/plus/watchlist" is Saved, not the player, so the match is on the segment.
  const onPlayer = pathname === "/plus/watch" || pathname.startsWith("/plus/watch/");
  const shownTheme = onPlayer ? "dark" : theme;

  const gated = ftnPlusAccess === "members_only" && !currentUser;
  const splash = <OTTLoader ready={!loadingSession && (gated || !loadingLibrary)} />;

  // While validating session on initial load, only the splash is visible
  if (loadingSession) {
    return <div className="h-screen w-screen bg-ftn-bg">{splash}</div>;
  }

  // If members only and logged out: Mask and render only the clean black authentication screen
  if (gated) {
    return (
      <div className="min-h-screen w-screen bg-ftn-bg text-ftn-text flex flex-col items-center justify-center p-6 space-y-6 select-none">
        {splash}
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="ftn-title text-2xl sm:text-3xl text-ftn-text">
            Authenticate with Roblox to view FTN+
          </h1>

          <div className="pt-2">
            <Button href={`/api/auth/roblox?returnUrl=${encodeURIComponent(pathname || "/plus")}`} size="lg" hard className="w-full">
              Sign In
            </Button>
          </div>

          <div>
            <Link href="/" className="text-xs text-ftn-text-3 hover:text-ftn-text transition">
              ← Return to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-ftn-theme={shownTheme}
      className={cn(
        shownTheme === "dark" && "dark",
        "bg-ftn-bg text-ftn-text w-full h-screen overflow-y-auto overflow-x-hidden ott-scroll no-scrollbar"
      )}
    >
      {/* Session Entry Loader */}
      {splash}
      {!onPlayer && <FtnNav links={links} theme={theme} onToggleTheme={toggleTheme} />}
      <PageTransition order={links.map((l) => l.href)}>{children}</PageTransition>
    </div>
  );
}
