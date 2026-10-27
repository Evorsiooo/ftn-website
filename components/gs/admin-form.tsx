import React from "react";
import { cn } from "@/lib/utils";

/**
 * A settings section: the title and a line of purpose sit in a left column, the controls in a card on the right.
 * Stacks on narrow screens. Use it for every group of fields so admin forms read the same everywhere.
 */
export function AdminSection({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
      <header className="lg:pt-1">
        <h2 className="text-lg font-extrabold leading-snug">{title}</h2>
        {description && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{description}</p>}
      </header>
      <div className={cn("min-w-0 space-y-6 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6", className)}>
        {children}
      </div>
    </section>
  );
}

/** One on/off control. Replaces the paired ON / OFF buttons. */
export function AdminSwitch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 disabled:cursor-not-allowed disabled:opacity-40 w-12 shrink-0 cursor-pointer items-center rounded-full transition",
        checked ? "bg-brand" : "bg-neutral-300 dark:bg-neutral-700"
      )}
    >
      <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

/** A labelled field with an optional hint line. */
export function AdminField({ label, hint, children, className }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="block text-sm font-semibold">{label}</label>
      {hint && <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
      {children}
    </div>
  );
}
