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

/** A single setting on one line: label and hint on the left, the control on the right. */
export function AdminRow({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        {hint && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Pick one of a few options. Replaces the hand-coloured button pairs. */
export function AdminSegmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
}) {
  return (
    <div role="radiogroup" className="inline-flex max-w-full shrink-0 flex-wrap rounded-full border border-neutral-300 bg-neutral-100 p-1 dark:border-neutral-700 dark:bg-neutral-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition",
            value === o.value ? "bg-brand text-brand-ink shadow-sm" : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Sticks to the bottom of the screen while a settings page has unsaved changes. */
export function AdminSaveBar({
  dirty,
  changed,
  saving,
  saved,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  changed?: string[];
  saving: boolean;
  saved: boolean;
  onSave: (e: React.FormEvent) => void;
  onDiscard: () => void;
}) {
  if (!dirty && !saving && !saved) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[150] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-4 rounded-full bg-[#16110a] py-2 pl-6 pr-2 text-sm font-semibold text-[#fff8e6] shadow-2xl">
        <span>{saving ? "Saving…" : dirty ? (changed && changed.length ? `Unsaved: ${changed.join(", ")}` : "You have unsaved changes") : "Saved"}</span>
        {dirty && !saving && (
          <>
            <button type="button" onClick={onDiscard} className="cursor-pointer text-[#fff8e6]/70 hover:text-[#fff8e6]">
              Discard
            </button>
            <button type="button" onClick={onSave} className="h-10 cursor-pointer rounded-full bg-brand px-5 font-bold text-brand-ink hover:bg-brand-hover">
              Save changes
            </button>
          </>
        )}
      </div>
    </div>
  );
}
