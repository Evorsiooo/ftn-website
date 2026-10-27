"use client";
import React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { GUTTER } from "./ui";

/** Root of every FTN+ page: surface, enter animation, bottom space. */
export function PageShell({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("ftn-page-enter min-h-screen bg-ftn-bg text-ftn-text pb-32 md:pb-20", className)}>{children}</div>;
}

/** Standard page opening: display title, subtitle, actions. Clears the floating nav. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  back,
  flush,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: React.ReactNode;
  /** The header sits directly under a hero, so it needs no room for the floating nav. */
  flush?: boolean;
  className?: string;
}) {
  return (
    <header className={cn("relative", className)}>
      <div className={cn("relative pb-8 space-y-3", flush ? "pt-2" : "pt-16 md:pt-32", GUTTER)}>
        {back}
        {/* A bare "FTN+" label says nothing the user doesn't know, so it is never shown. */}
        {eyebrow && eyebrow !== "FTN+" && <div className="text-sm font-semibold text-ftn-text-3 flex items-center gap-2">{eyebrow}</div>}
        <h1 className="ftn-display text-4xl sm:text-5xl md:text-6xl text-ftn-text">{title}</h1>
        {subtitle && <p className="text-sm sm:text-base text-ftn-text-2 max-w-2xl">{subtitle}</p>}
        {actions && <div className="flex flex-wrap items-center gap-3 pt-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Equalizer({ active, className }: { active: boolean; className?: string }) {
  return (
    <div className={cn("flex items-end gap-[3px] h-4", className)} aria-hidden>
      {[0.5, 1, 0.7, 0.9, 0.4].map((peak, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-brand"
          animate={active ? { height: ["20%", `${peak * 100}%`, "30%", `${peak * 85}%`, "20%"] } : { height: "20%" }}
          transition={active ? { duration: 1 + i * 0.15, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
        />
      ))}
    </div>
  );
}
