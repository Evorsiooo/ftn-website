"use client";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { enterFtnPlus, originOf } from "@/lib/site-transition";

/** A link from the main site into FTN+ that plays the gold to dark hand-off before navigating. */
export function PlusLink({
  href,
  children,
  ...rest
}: Omit<React.ComponentProps<typeof Link>, "href" | "onClick"> & { href: string }) {
  const router = useRouter();
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    enterFtnPlus(originOf(e), () => router.push(href));
  };
  return (
    <Link href={href} onClick={onClick} {...rest}>
      {children}
    </Link>
  );
}
