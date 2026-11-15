"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fetchSession } from "@/lib/session-client";
import { OTTLoader } from "@/components/ott/ott-loader";
import { FTNPlusProvider, useFTNPlus } from "@/lib/ftnplus-context";
import { useSiteConfig } from "@/lib/site-config-context";
import { PhoneTabs, TopBar, type PlusUser } from "@/components/plus/shell";
import { useRadio } from "@/components/radio/radio-provider";

// The provider sits above the session gate so the library request starts
// immediately, in parallel with the session check, while the splash is shown.
export default function OTTClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <FTNPlusProvider>
      <OTTShell>{children}</OTTShell>
    </FTNPlusProvider>
  );
}

function OTTShell({ children }: { children: React.ReactNode }) {
  const { loadingLibrary } = useFTNPlus();
  const [user, setUser] = useState<PlusUser>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const pathname = usePathname() || "/plus";
  const { ftnPlusAccess } = useSiteConfig();
  const radio = useRadio();

  // The FTN+ icon while on FTN+, and FTN's again when leaving it.
  useEffect(() => {
    let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = "/logos/ftnplus_favicon.png";
    return () => {
      if (link) link.href = "/logos/ftn_favicon_transparent.png";
    };
  }, [pathname]);

  useEffect(() => {
    fetchSession()
      .then((data: any) => setUser(data?.authenticated && data.user ? data.user : null))
      .catch(() => setUser(null))
      .finally(() => setLoadingSession(false));
  }, []);

  const gated = ftnPlusAccess === "members_only" && !user;
  const splash = <OTTLoader ready={!loadingSession && (gated || !loadingLibrary)} />;

  if (loadingSession) return <div className="fp">{splash}</div>;

  if (gated) {
    return (
      <div className="fp">
        {splash}
        <main className="gate">
          <div>
            <h1 className="h1">Sign in with Roblox to watch FTN+</h1>
            <a className="btn main lg" href={`/api/auth/roblox?returnUrl=${encodeURIComponent(pathname)}`}>
              Sign in
            </a>
            <Link className="back" href="/">
              Back to FTN
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // The radio player bar (rendered by the radio provider) sits above the page's bottom: leave room for it.
  return (
    <div className={`fp${radio.barShown ? " listening" : ""}`}>
      {splash}
      <TopBar user={user} />
      {/* keyed by page, so each FTN+ page fades in as it opens */}
      <div className="page-in" key={pathname}>
        {children}
      </div>
      <PhoneTabs />
    </div>
  );
}
