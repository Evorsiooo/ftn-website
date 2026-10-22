"use client";
import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Shared page gutter: every FTN+ page and lane aligns to this.
export const GUTTER = "px-5 md:px-12";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition duration-200 cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-ink hover:bg-brand-hover",
  secondary: "bg-ftn-surface-2 text-ftn-text border border-ftn-line-strong hover:bg-white/10",
  ghost: "bg-transparent text-ftn-text border border-ftn-line-strong hover:bg-white/5",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-xs",
  md: "h-11 px-6 text-sm",
  lg: "h-14 px-8 text-sm",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square icon-only button. */
  icon?: boolean;
  href?: string;
  external?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & { className?: string };

export function Button({ variant, size = "md", icon, href, external, className, children, ...rest }: ButtonProps) {
  const cls = cn(buttonClass(variant, size, className), icon && "!px-0 aspect-square");
  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

/** Toggle chip, one active style everywhere (filters, tabs, days). */
export function Chip({
  active,
  className,
  children,
  ...rest
}: { active?: boolean; className?: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex items-center h-9 px-4 rounded-full text-xs font-semibold border transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        active
          ? "bg-ftn-surface-2 text-ftn-text border-ftn-line-strong shadow-[inset_0_0_0_1px_var(--color-ftn-line-strong)]"
          : "bg-ftn-surface text-ftn-text-2 border-ftn-line hover:text-ftn-text hover:border-ftn-line-strong",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Pill-shaped segmented control built from chips. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  className?: string;
}) {
  return (
    <div role="group" className={cn("inline-flex gap-1 p-1 rounded-full bg-ftn-surface border border-ftn-line", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-8 px-4 rounded-full text-xs font-semibold transition cursor-pointer focus-visible:outline-2 focus-visible:outline-brand",
            value === o.id
              ? "bg-ftn-surface-2 text-ftn-text shadow-[inset_0_0_0_1px_var(--color-ftn-line-strong)]"
              : "text-ftn-text-2 hover:text-ftn-text"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const pill =
  "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-eyebrow font-bold tracking-wide whitespace-nowrap border";

/** Red pulsing LIVE / ON AIR pill. */
export function LivePill({ children = "LIVE", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn(pill, "uppercase bg-live/15 text-live-ink border-live/40", className)}>
      <span className="ftn-live-dot h-1.5 w-1.5 rounded-full bg-live animate-[ftn-pulse-dot_2s_ease-in-out_infinite]" />
      {children}
    </span>
  );
}

/** Neutral tag (Up next, Rebroadcast, Cancelled, Final…). */
export function Tag({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "brand";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        pill,
        "uppercase",
        tone === "brand" ? "bg-brand/15 text-brand border-brand/30" : "bg-ftn-surface-2 text-ftn-text-2 border-ftn-line",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Tag that sits on top of artwork and stays legible on any image. */
export function ArtBadge({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <div className="absolute top-2.5 left-2.5 z-10">
      {live ? (
        <LivePill className="bg-black/80 backdrop-blur-sm">{children}</LivePill>
      ) : (
        <Tag className="bg-black/80 text-white border-white/10 backdrop-blur-sm">{children}</Tag>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("ftn-skeleton rounded-xl", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-3 rounded-2xl border border-dashed border-ftn-line-strong bg-ftn-surface/50 px-6 py-12",
        className
      )}
    >
      {icon && <div className="text-ftn-text-3 [&>svg]:h-9 [&>svg]:w-9">{icon}</div>}
      <h3 className="ftn-title text-lg text-ftn-text">{title}</h3>
      {description && <p className="text-sm text-ftn-text-2 max-w-sm">{description}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1 w-full rounded-full bg-ftn-surface-2 overflow-hidden", className)}
    >
      <div className="h-full rounded-full bg-brand transition-all duration-1000" style={{ width: `${value}%` }} />
    </div>
  );
}
