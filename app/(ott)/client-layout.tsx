"use client";
import { fetchSession } from "@/lib/session-client";
import React, { useState, useEffect } from "react";
import { Sidebar, SidebarBody, SidebarLink } from "@/components/ui/sidebar";
import { OTTLoader } from "@/components/ott/ott-loader";
import { Button } from "@/components/ui/button";
import {
  IconHome,
  IconBookmark,
  IconCalendar,
  IconRadio,
  IconTrophy,
  IconArrowLeft,
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
  const [open, setOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const pathname = usePathname();
  const { webradioEnabled, ftnPlusAccess } = useSiteConfig();

  // Dynamic favicon and title synchronization
  useEffect(() => {
    document.title = "FTN+";
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

  const links = [
    {
      label: "Home",
      href: "/plus",
      icon: (
        <IconHome className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" />
      ),
    },
    {
      label: "Saved",
      href: "/plus/watchlist",
      icon: (
        <IconBookmark className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" />
      ),
    },
    {
      label: "Schedule",
      href: "#",
      icon: (
        <IconCalendar className="text-neutral-700 dark:text-neutral-400 h-5 w-5 flex-shrink-0 opacity-50 cursor-not-allowed" />
      ),
    },
    webradioEnabled
      ? {
          label: "Webradio",
          href: "/plus/radio",
          icon: (
            <IconRadio className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" />
          ),
        }
      : {
          label: "Webradio",
          href: "#",
          icon: (
            <IconRadio className="text-neutral-700 dark:text-neutral-400 h-5 w-5 flex-shrink-0 opacity-50 cursor-not-allowed" />
          ),
        },
    {
      label: "Sports",
      href: "/plus/sports",
      icon: (
        <IconTrophy className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" />
      ),
    },
  ];

  const gated = ftnPlusAccess === "members_only" && !currentUser;
  const splash = <OTTLoader ready={!loadingSession && (gated || !loadingLibrary)} />;

  // While validating session on initial load, only the splash is visible
  if (loadingSession) {
    return <div className="h-screen w-screen bg-black">{splash}</div>;
  }

  // If members only and logged out: Mask and render only the clean black authentication screen
  if (gated) {
    return (
      <div className="min-h-screen w-screen bg-black text-white flex flex-col items-center justify-center p-6 space-y-6 select-none">
        {splash}
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Authenticate with Roblox to view FTN+
          </h1>

          <div className="pt-2">
            <a href="/api/auth/roblox?returnUrl=/plus">
              <Button className="w-full bg-[#FFBB14] hover:bg-[#e5a710] text-black font-bold text-xs h-11 cursor-pointer">
                Sign In
              </Button>
            </a>
          </div>

          <div>
            <Link href="/" className="text-xs text-neutral-400 hover:text-white transition">
              ← Return to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "dark flex flex-col md:flex-row bg-neutral-900 text-white w-full flex-1 overflow-hidden h-screen ott-scroll no-scrollbar"
        )}
      >
        {/* Session Entry Loader */}
        {splash}

        <Sidebar open={open} setOpen={setOpen}>
          <SidebarBody className="justify-between gap-10">
            <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
              {open ? <Logo /> : <LogoIcon />}
              <div className="mt-8 flex flex-col gap-2">
                {links.map((link, idx) => (
                  <SidebarLink key={idx} link={link} />
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-neutral-800/60">
              <SidebarLink
                link={{
                  label: "Exit to FTN Main",
                  href: "/",
                  // Full load: a soft transition into the heavy public home page
                  // can stall behind its server render and look like a dead button.
                  hardNavigate: true,
                  icon: (
                    <IconArrowLeft className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" />
                  ),
                }}
              />
            </div>
          </SidebarBody>
        </Sidebar>
        <div className="flex flex-1 min-w-0 min-h-0 bg-neutral-900">
          <div className="rounded-tl-2xl border-l border-t border-neutral-800 bg-neutral-950 flex flex-col flex-1 w-full h-full overflow-y-auto overflow-x-hidden no-scrollbar">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

export const Logo = () => {
  return (
    <Link
      href="/plus"
      className="font-normal flex space-x-2 items-center text-sm text-white py-1 relative z-20 select-none"
    >
      <img
        src="/logos/ftnplus_textwhite_transparent.png"
        alt="FTN+"
        className="h-6 w-auto object-contain flex-shrink-0"
      />
    </Link>
  );
};

export const LogoIcon = () => {
  return (
    <Link
      href="/plus"
      className="font-normal flex space-x-2 items-center text-sm text-white py-1 relative z-20 select-none"
    >
      <img
        src="/logos/ftnplus_favicon.png"
        alt="FTN+"
        className="h-6 w-6 object-contain flex-shrink-0"
      />
    </Link>
  );
};
