"use client";
import React from "react";
import { useTheme } from "@/lib/theme-context";
import { IconSun, IconMoon } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className, isMobile = false }: { className?: string; isMobile?: boolean }) {
  const { theme, toggleTheme, mounted } = useTheme();

  if (!mounted) {
    return (
      <div
        className={cn(
          "px-3 py-1.5 h-8 rounded-lg bg-neutral-200 dark:bg-neutral-800 opacity-50 flex items-center justify-center",
          className
        )}
      >
        <div className="h-4 w-4" />
      </div>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className={cn(
        "relative inline-flex items-center justify-center rounded-lg px-3 py-1.5 h-8 text-xs font-bold transition-all duration-200 cursor-pointer shadow-[0px_2px_0px_0px_#FFFFFF40_inset]",
        isDark
          ? "bg-[#FFBB14] hover:bg-[#e5a710] text-black"
          : "bg-neutral-900 hover:bg-neutral-800 text-white",
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        {isDark ? (
          <IconSun className="h-4 w-4 stroke-[2.5]" />
        ) : (
          <IconMoon className="h-4 w-4 stroke-[2.5]" />
        )}
        {isMobile && (
          <span className="font-semibold text-xs">
            {isDark ? "Light" : "Dark"}
          </span>
        )}
      </div>
    </button>
  );
}
