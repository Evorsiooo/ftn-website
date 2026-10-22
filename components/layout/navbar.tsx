"use client";
import React, { useState, useEffect } from "react";
import {
  Navbar as ResizableNavbar,
  NavBody,
  NavItems,
  MobileNav,
  NavbarLogo,
  NavbarButton,
  MobileNavHeader,
  MobileNavToggle,
  MobileNavMenu,
} from "@/components/ui/resizable-navbar";
import { AuthButton } from "./auth-button";
import { ThemeToggle } from "./theme-toggle";
import { useSiteConfig } from "@/lib/site-config-context";

export function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { discordUrl } = useSiteConfig();

  const radioLink = "/plus/radio";

  const navItems = [
    {
      name: "Home",
      link: "/",
    },
    {
      name: "Webradio",
      link: radioLink,
    },
    {
      name: "Games",
      link: "/games",
    },
    {
      name: "Tipline",
      link: "/tips",
    },
  ];

  return (
    <ResizableNavbar>
      {/* Desktop Navigation */}
      <NavBody>
        <NavbarLogo href="/" title="FTN Media" />
        <NavItems items={navItems} />
        <div className="flex items-center gap-2">
          {/* Light/Dark Mode Toggle */}
          <ThemeToggle />

          {/* Discord Purple Button */}
          <NavbarButton
            href={discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="discord"
            className="px-3.5 py-1.5 h-8 flex items-center justify-center cursor-pointer"
            title="Join Official Discord"
          >
            <img
              src="/logos/social_logo_white.png"
              alt="Discord"
              className="h-3.5 sm:h-4 w-auto object-contain"
            />
          </NavbarButton>

          {/* FTN+ Gold Button */}
          <NavbarButton
            href="/plus"
            variant="ftn-plus"
            className="px-3.5 py-1.5 h-8 flex items-center justify-center cursor-pointer"
          >
            <img
              src="/logos/ftnplus_textwhitepluswhite_transparent.png"
              alt="FTN+"
              className="h-3.5 sm:h-4 w-auto object-contain"
            />
          </NavbarButton>

          <AuthButton />
        </div>
      </NavBody>

      {/* Mobile Navigation */}
      <MobileNav>
        <MobileNavHeader>
          <NavbarLogo href="/" title="FTN Media" />
          <MobileNavToggle
            isOpen={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          />
        </MobileNavHeader>

        <MobileNavMenu
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
        >
          {navItems.map((item, idx) => (
            <a
              key={`mobile-link-${idx}`}
              href={item.link}
              target={item.link.startsWith("http") ? "_blank" : undefined}
              rel={item.link.startsWith("http") ? "noopener noreferrer" : undefined}
              onClick={() => setIsMobileMenuOpen(false)}
              className="py-1 text-sm font-semibold text-neutral-700 hover:text-black dark:text-neutral-300 dark:hover:text-white"
            >
              {item.name}
            </a>
          ))}
          <div className="flex w-full flex-wrap items-center justify-between pt-2 border-t border-neutral-200 dark:border-neutral-800 gap-2">
            <ThemeToggle isMobile className="flex-1 h-9" />

            <NavbarButton
              href={discordUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="discord"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex-1 h-9 flex items-center justify-center cursor-pointer"
            >
              <img
                src="/logos/social_logo_white.png"
                alt="Discord"
                className="h-4 w-auto object-contain"
              />
            </NavbarButton>

            <NavbarButton
              href="/plus"
              variant="ftn-plus"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex-1 h-9 flex items-center justify-center cursor-pointer"
            >
              <img
                src="/logos/ftnplus_textwhitepluswhite_transparent.png"
                alt="FTN+"
                className="h-4 w-auto object-contain"
              />
            </NavbarButton>
            <AuthButton />
          </div>
        </MobileNavMenu>
      </MobileNav>
    </ResizableNavbar>
  );
}
