"use client";
import React, { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Building blocks of the admin panel. Pages are made from these and the classes in app/(admin)/admin.css,
 * so every page has the same bar, the same controls and the same side panel.
 */

/** One admin page: the page bar on top, then the body, which fills the rest of the screen. */
export function Screen({ children }: { children: React.ReactNode }) {
  return <div className="adm-screen">{children}</div>;
}

/**
 * The 56px bar on top of every page. Title (or a breadcrumb) on the left, filters in the middle,
 * actions on the right. On phones, `mrow` is a second row for the filters that don't fit.
 */
export function PageBar({
  title,
  crumb,
  tools,
  end,
  mrow,
}: {
  title: React.ReactNode;
  crumb?: { href: string; label: string; onClick?: (e: React.MouseEvent) => void };
  tools?: React.ReactNode;
  end?: React.ReactNode;
  mrow?: React.ReactNode;
}) {
  return (
    <>
      <header className="adm-bar">
        <h1>
          {crumb && (
            <>
              <Link href={crumb.href} className="crumb t16" onClick={crumb.onClick}>
                {crumb.label}
              </Link>
              <span className="sep t16">/</span>
            </>
          )}
          <span className="trunc">{title}</span>
        </h1>
        {tools && <div className="tools hide-m">{tools}</div>}
        {end && <div className="end">{end}</div>}
      </header>
      {mrow && <div className="adm-mrow">{mrow}</div>}
    </>
  );
}

/** The main scrolling area of a page. Exactly one scroll area per column. */
export function Body({ children, scroll, className }: { children: React.ReactNode; scroll?: boolean; className?: string }) {
  return <div className={cn("adm-body", scroll && "adm-scroll", className)}>{children}</div>;
}

export function Seg<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; n?: number | string; disabled?: boolean }[];
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("seg", className)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={o.disabled} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
          {o.n !== undefined && <span className="n">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={cn("switch", checked && "on")} onClick={() => onChange(!checked)} />;
}

export type Tone = "amber" | "green" | "red" | "grey" | "blue" | "yellow";
export function Pill({ tone = "grey", children, dot }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cn("pill", tone)}>
      {dot && <span className={cn("dot", tone === "yellow" ? "amber" : tone)} style={{ boxShadow: "none", width: 6, height: 6 }} />}
      {children}
    </span>
  );
}

export function Field({ label, help, error, children, className }: { label?: React.ReactNode; help?: React.ReactNode; error?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("field", className)}>
      {label && <label>{label}</label>}
      {children}
      {error ? <div className="err">{error}</div> : help ? <div className="help">{help}</div> : null}
    </div>
  );
}

/** One setting on a line: label and help on the left, the control on the right. */
export function Line({ label, help, children }: { label: React.ReactNode; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="line">
      <div>
        <div style={{ fontWeight: 500 }}>{label}</div>
        {help && <div className="help">{help}</div>}
      </div>
      {children}
    </div>
  );
}

/** A form section: a title, one line of what it is for, then its fields. Sections are separated by a rule, not boxed. */
export function Section({ title, desc, children, id, aside }: { title: React.ReactNode; desc?: React.ReactNode; children?: React.ReactNode; id?: string; aside?: React.ReactNode }) {
  return (
    <section className="fsec" id={id}>
      <h2>
        {title}
        {aside && <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>{aside}</span>}
      </h2>
      {desc && <p className="desc">{desc}</p>}
      {children}
    </section>
  );
}

export function Facts({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="facts">
      {rows.map(([k, v], i) => (
        <React.Fragment key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/** The back arrow that returns from a detail to its list on phones. Hidden on wider screens. */
export function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="iconbtn back" aria-label={label} onClick={onClick}>
      <ArrowLeft className="ic" />
    </button>
  );
}

/**
 * The admin's one side panel, for creating or editing a thing without leaving the page.
 * Title and close on top, the form in the middle (the only scroll area), actions at the bottom.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  wide,
  headActions,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  headActions?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".adm-dialog-back") && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="adm-sheet-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} className={cn("adm-sheet", wide && "wide")}>
        <div className="adm-sheet-head">
          <h2>{title}</h2>
          {headActions}
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}>
            <X className="ic" />
          </button>
        </div>
        <div className="adm-sheet-body">{children}</div>
        {footer && <div className="adm-sheet-foot">{footer}</div>}
      </aside>
    </div>
  );
}

/** Floats at the bottom while a form has unsaved changes. */
export function SaveBar({
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
  saved?: boolean;
  onSave: (e: React.FormEvent) => void;
  onDiscard: () => void;
}) {
  if (!dirty && !saving && !saved) return null;
  return (
    <div className="savebar" role="status">
      <span>{saving ? "Saving…" : dirty ? (changed && changed.length ? `Unsaved: ${changed.join(", ")}` : "Unsaved changes") : "Saved"}</span>
      {dirty && !saving && (
        <>
          <button type="button" className="btn ghost sm" onClick={onDiscard}>
            Discard
          </button>
          <button type="button" className="btn primary sm" onClick={onSave}>
            Save
          </button>
        </>
      )}
    </div>
  );
}

/** Class for the shared date/time picker so it matches admin inputs. */
export const DT_CLASS =
  "h-9 rounded-[6px] border border-[var(--a-border-strong)] bg-[var(--a-surface)] px-2.5 py-0 text-sm text-[var(--a-text)] dark:border-[var(--a-border-strong)] dark:bg-[var(--a-surface)] dark:text-[var(--a-text)]";

/** Class for the shared Select so it matches admin inputs. */
export const SELECT_CLASS = "select h-9 w-full";

/** "Today 14:30", "Tomorrow 09:00", "Wed 19 Nov 18:00": one date and time format for the whole admin (24-hour). */
export function formatWhen(v: string | number | Date | null | undefined, opts: { year?: boolean } = {}): string {
  if (v === null || v === undefined || v === "") return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(today)) / 86400000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days === -1) return `Yesterday ${time}`;
  const date = d.toLocaleDateString(undefined, {
    weekday: Math.abs(days) < 7 ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: opts.year || d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
  return `${date} ${time}`;
}

/** "12 Nov" or "12 Nov 2025": dates without a time. */
export function formatDay(v: string | number | Date | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

/** "3 min ago", "2 h ago", "4 days ago". */
export function ago(v: string | number | Date | null | undefined): string {
  if (!v) return "";
  const ms = Date.now() - new Date(v).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="empty">{label}</div>;
}

/** "18:30": the admin always shows 24-hour times. */
export const hm = (d: Date | number) => new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
