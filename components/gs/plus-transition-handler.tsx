"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { enterFtnPlus, originOf } from "@/lib/site-transition";

/**
 * One click listener for the whole main site: any plain link that leads into FTN+ (/plus and below)
 * plays the gold to dark hand-off, so no link has to opt in and none can be missed. It runs in the
 * capture phase and cancels the click first, which makes Next's Link stand down, and navigates itself.
 */
export function PlusTransitionHandler() {
  const router = useRouter();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const toPlus = url.pathname === "/plus" || url.pathname.startsWith("/plus/");
      const fromPlus = window.location.pathname === "/plus" || window.location.pathname.startsWith("/plus/");
      if (!toPlus || fromPlus || url.pathname.startsWith("/plus/radio/popout")) return;
      e.preventDefault();
      enterFtnPlus(originOf({ clientX: e.clientX, clientY: e.clientY, currentTarget: a }), () => router.push(url.pathname + url.search + url.hash));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}
