"use client";
import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Shared page gutter: every FTN+ page and lane aligns to this.
export const GUTTER = "px-5 md:px-12";

type ButtonVariant = "primary" | "secondary" | "ghost" | "glass";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition duration-200 cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-ink hover:bg-brand-hover",
  secondary: "bg-ftn-surface-2 text-ftn-text border border-ftn-line-strong hover:bg-ftn-text/10",
  ghost: "bg-transparent text-ftn-text border border-ftn-line-strong hover:bg-ftn-text/5",
  /** For use on top of artwork: stays white-on-dark in both themes. */
  glass: "bg-white/15 text-white border border-white/25 backdrop-blur-md hover:bg-white/25",
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
  /** Plain same-tab anchor (API routes, full page loads). */
  hard?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & { className?: string };

export function Button({ variant, size = "md", icon, href, external, hard, className, children, ...rest }: ButtonProps) {
  const cls = cn(buttonClass(variant, size, className), icon && "!px-0 aspect-square");
  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  if (href && hard) {
    return (
      <a href={href} className={cls}>
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

/** Filter control (library filters, days). One active style everywhere. */
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
        "inline-flex items-center h-10 px-5 rounded-full text-sm font-semibold border transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        active
          ? "bg-ftn-text text-ftn-bg border-transparent"
          : "bg-ftn-surface text-ftn-text-2 border-ftn-line hover:text-ftn-text hover:border-ftn-line-strong",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Pill-shaped segmented control. */
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
            "h-9 px-5 rounded-full text-sm font-semibold transition cursor-pointer focus-visible:outline-2 focus-visible:outline-brand",
            value === o.id ? "bg-ftn-text text-ftn-bg" : "text-ftn-text-2 hover:text-ftn-text"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Red LIVE badge for artwork. It is the one badge kept on cards, because a lane of
 * thumbnails gives no other cue for which item is live. Do not add other badges.
 */
export function LivePill({ children = "Live", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-live text-white text-[length:var(--text-eyebrow)] font-bold uppercase tracking-wide whitespace-nowrap",
        className
      )}
    >
      <span className="ftn-live-dot h-1.5 w-1.5 rounded-full bg-white animate-[ftn-pulse-dot_2s_ease-in-out_infinite]" />
      {children}
    </span>
  );
}

/** Inline "Live" marker for rows and headings: a dot and plain text, not a chip. */
export function LiveLabel({ children = "Live", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-live-ink", className)}>
      <span className="ftn-live-dot h-1.5 w-1.5 rounded-full bg-live animate-[ftn-pulse-dot_2s_ease-in-out_infinite]" />
      {children}
    </span>
  );
}

/** LIVE badge positioned over artwork. */
export function ArtBadge({ children }: { children?: React.ReactNode }) {
  return (
    <div className="absolute top-3 left-3 z-10">
      <LivePill>{children ?? "Live"}</LivePill>
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
