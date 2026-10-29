"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconMenu2, IconX } from "@tabler/icons-react";
import { PlusLink } from "@/components/gs/plus-link";
import { AuthButton } from "@/components/layout/auth-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useSiteConfig } from "@/lib/site-config-context";
import { plusHref } from "@/lib/plus-links";
import { cn } from "@/lib/utils";

const NAV = [
  { name: "Home", link: "/" },
  { name: "Webradio", link: "/plus/radio" },
  { name: "Games", link: "/games" },
  { name: "Tipline", link: "/tips" },
];

function isActive(pathname: string, link: string) {
  if (link === "/") return pathname === "/" || pathname.startsWith("/articles");
  return pathname === link || pathname.startsWith(`${link}/`);
}

/** The gold masthead bar, shared by the public site and admin. It sticks to the top. */
export function GsHeader({ section }: { section?: string }) {
  const pathname = usePathname();
  const { discordUrl } = useSiteConfig();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-50 bg-brand text-brand-ink">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex select-none items-center" aria-label="FTN Media home">
            <img src="/logos/ftn_text_transparent.png" alt="FTN Media" className="h-8 w-auto object-contain" />
          </Link>
          {section && (
            <span className="gs-display hidden border-l border-brand-ink/30 pl-3 text-sm font-extrabold sm:block">{section}</span>
          )}
        </div>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.link}
              href={item.link}
              aria-current={isActive(pathname, item.link) ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-bold transition",
                isActive(pathname, item.link) ? "bg-[#16110a] text-[#fff8e6]" : "hover:bg-brand-ink/10"
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle className="!h-9 !rounded-full !bg-transparent !px-2.5 !text-brand-ink !shadow-none ring-1 ring-brand-ink/30 hover:!bg-brand-ink/10" />
          <a
            href={discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full px-3 py-2 text-sm font-bold hover:bg-brand-ink/10"
          >
            Discord
          </a>
          <PlusLink
            href={plusHref("/plus", "nav")}
            title="FTN+"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#16110a] px-4 transition hover:bg-black"
          >
            <img src="/logos/ftnplus_textwhite_transparent.png" alt="FTN+" className="h-4 w-auto object-contain" />
          </PlusLink>
          <AuthButton />
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation menu"
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-brand-ink/30 lg:hidden"
        >
          {open ? <IconX className="h-5 w-5" /> : <IconMenu2 className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-brand-ink/15 px-4 pb-5 pt-3 sm:px-8 lg:hidden">
          <nav className="flex flex-col" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.link}
                href={item.link}
                className={cn(
                  "gs-display border-b border-brand-ink/15 py-3 text-2xl font-extrabold",
                  isActive(pathname, item.link) && "underline decoration-2 underline-offset-8"
                )}
              >
                {item.name}
              </Link>
            ))}
            <PlusLink href={plusHref("/plus", "nav")} className="gs-display border-b border-brand-ink/15 py-3 text-2xl font-extrabold">
              FTN+
            </PlusLink>
            <a href={discordUrl} target="_blank" rel="noopener noreferrer" className="gs-display py-3 text-2xl font-extrabold">
              Discord
            </a>
          </nav>
          <div className="mt-3 flex items-center gap-3">
            <ThemeToggle isMobile className="!h-9 !rounded-full !bg-[#16110a] !text-[#fff8e6] !shadow-none" />
            <AuthButton />
          </div>
        </div>
      )}
    </header>
  );
}
