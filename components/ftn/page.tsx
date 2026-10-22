"use client";
import React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { GUTTER } from "./ui";

/** Root of every FTN+ page: surface, enter animation, bottom space. */
export function PageShell({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("ftn-page-enter min-h-screen bg-ftn-bg text-ftn-text pb-20", className)}>{children}</div>;
}

/** Standard page opening: eyebrow, display title, subtitle, actions, soft brand glow. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  back,
  glow = true,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: React.ReactNode;
  /** Soft brand glow behind the header; off when the header sits under a hero. */
  glow?: boolean;
  className?: string;
}) {
  return (
    <header className={cn("relative overflow-hidden", className)}>
      {glow && <div className="pointer-events-none absolute -top-32 right-0 h-80 w-[40rem] max-w-full rounded-full bg-brand/10 blur-3xl" />}
      <div className={cn("relative pt-14 md:pt-16 pb-8 space-y-3", GUTTER)}>
        {back}
        {eyebrow && <div className="ftn-eyebrow text-brand flex items-center gap-2">{eyebrow}</div>}
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
