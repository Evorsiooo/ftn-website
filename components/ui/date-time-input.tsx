"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PopoverPanel } from "@/components/ui/popover-panel";

type Kind = "date" | "time" | "datetime-local";
export type DateTimeChange = { target: { value: string; name?: string }; currentTarget: { value: string; name?: string } };

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function splitValue(v: string): { date: string; time: string } {
  if (!v) return { date: "", time: "" };
  const [d, t] = v.split("T");
  return { date: d?.includes("-") ? d : "", time: (d?.includes(":") ? d : t) ?? "" };
}

function parseDate(d: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
}

function parseTime(t: string): { h: number; m: number } {
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? { h: +m[1], m: +m[2] } : { h: 0, m: 0 };
}

function display(kind: Kind, value: string): string {
  const { date, time } = splitValue(value);
  const dp = parseDate(date);
  const dateText = dp ? `${dp.d} ${MONTHS[dp.m].slice(0, 3)} ${dp.y}` : "";
  const timeText = time ? time.slice(0, 5) : "";
  if (kind === "date") return dateText;
  if (kind === "time") return timeText;
  return dateText && timeText ? `${dateText}, ${timeText}` : dateText || timeText;
}

export interface DateTimeInputProps {
  type: Kind;
  value?: string;
  onChange?: (e: DateTimeChange) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}

/** Themed date / time / date-and-time picker with the same value formats and onChange contract as the native inputs. */
export function DateTimeInput({ type, value = "", onChange, name, id, disabled, required, min, max, className, placeholder, ...rest }: DateTimeInputProps) {
  const [open, setOpen] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const close = React.useCallback(() => setOpen(false), []);

  const { date, time } = splitValue(value);
  const today = new Date();
  const base = parseDate(date) ?? { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() };
  const [view, setView] = React.useState({ y: base.y, m: base.m });

  React.useEffect(() => {
    if (open) setView({ y: base.y, m: base.m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const emit = (next: string) => {
    const target = { value: next, name };
    onChange?.({ target, currentTarget: target });
  };

  const compose = (d: string, t: string) => (type === "date" ? d : type === "time" ? t : d ? `${d}T${t || "00:00"}` : "");

  const pickDay = (y: number, m: number, d: number) => {
    const ds = `${y}-${pad(m + 1)}-${pad(d)}`;
    emit(compose(ds, time || "00:00"));
    if (type === "date") close();
  };

  const pickTime = (h: number, m: number) => {
    const ds = date || `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    emit(compose(type === "time" ? "" : ds, `${pad(h)}:${pad(m)}`));
  };

  const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const daysIn = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  const sel = parseDate(date);
  const { h, m } = parseTime(time);
  const showDate = type !== "time";
  const showTime = type !== "date";

  const outOfRange = (y: number, mo: number, d: number) => {
    const ds = `${y}-${pad(mo + 1)}-${pad(d)}`;
    const lo = min ? splitValue(min).date : "";
    const hi = max ? splitValue(max).date : "";
    return (!!lo && ds < lo) || (!!hi && ds > hi);
  };

  const shift = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  const text = display(type, value);
  const Icon = type === "time" ? Clock : CalendarDays;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={rest["aria-label"]}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-left text-sm text-neutral-900 transition dark:border-neutral-700 dark:bg-neutral-900 dark:text-white focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", !text && "opacity-50")}>
          {text || placeholder || (type === "time" ? "Pick a time" : type === "date" ? "Pick a date" : "Pick date and time")}
        </span>
        <Icon className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
      </button>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <PopoverPanel anchor={trigger} open={open} onClose={close} minWidth={showDate ? 288 : 160} estimatedHeight={showDate ? 340 : 260} className="p-3">
        <div role="dialog" aria-label="Date and time picker" className="flex gap-3">
          {showDate ? (
            <div className="w-[264px] shrink-0">
              <div className="mb-2 flex items-center justify-between">
                <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="rounded-lg p-1.5 hover:bg-neutral-100 dark:hover:bg-white/10">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-sm font-semibold">
                  {MONTHS[view.m]} {view.y}
                </div>
                <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded-lg p-1.5 hover:bg-neutral-100 dark:hover:bg-white/10">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-y-0.5 text-center text-[11px] font-semibold text-neutral-500">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-1">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm">
                {cells.map((d, i) => {
                  if (d == null) return <div key={`b${i}`} />;
                  const isSel = !!sel && sel.y === view.y && sel.m === view.m && sel.d === d;
                  const isToday = today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d;
                  const off = outOfRange(view.y, view.m, d);
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={off}
                      onClick={() => pickDay(view.y, view.m, d)}
                      className={cn(
                        "mx-auto h-8 w-8 rounded-full transition",
                        isSel
                          ? "bg-brand font-bold text-brand-ink"
                          : "hover:bg-neutral-100 dark:hover:bg-white/10",
                        isToday && !isSel && "ring-1 ring-brand",
                        off && "cursor-not-allowed opacity-30"
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 text-xs font-semibold dark:border-white/10">
                <button
                  type="button"
                  className="rounded px-1.5 py-1 text-brand-text hover:underline"
                  onClick={() => {
                    setView({ y: today.getFullYear(), m: today.getMonth() });
                    pickDay(today.getFullYear(), today.getMonth(), today.getDate());
                  }}
                >
                  Today
                </button>
                {!required && value ? (
                  <button
                    type="button"
                    className="rounded px-1.5 py-1 text-neutral-500 hover:underline"
                    onClick={() => {
                      emit("");
                      close();
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {showTime ? (
            <div className={cn("flex gap-1", showDate && "border-l border-neutral-200 pl-3 dark:border-white/10")}>
              <TimeColumn label="Hours" count={24} step={1} current={time ? h : -1} onPick={(v) => pickTime(v, m)} />
              <TimeColumn label="Minutes" count={60} step={5} current={time ? m : -1} onPick={(v) => pickTime(h, v)} />
            </div>
          ) : null}
        </div>
        {type === "time" && !required && value ? (
          <div className="mt-2 border-t border-neutral-200 pt-2 text-xs font-semibold dark:border-white/10">
            <button
              type="button"
              className="rounded px-1.5 py-1 text-neutral-500 hover:underline"
              onClick={() => {
                emit("");
                close();
              }}
            >
              Clear
            </button>
          </div>
        ) : null}
        {type === "datetime-local" ? (
          <div className="mt-2 flex justify-end border-t border-neutral-200 pt-2 dark:border-white/10">
            <button type="button" onClick={close} className="rounded-lg bg-brand px-3 py-1 text-xs font-bold text-brand-ink hover:bg-brand-hover">
              Done
            </button>
          </div>
        ) : null}
      </PopoverPanel>
    </>
  );
}

function TimeColumn({ label, count, step, current, onPick }: { label: string; count: number; step: number; current: number; onPick: (v: number) => void }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "center" });
  }, []);
  const values = Array.from({ length: Math.ceil(count / step) }, (_, i) => i * step);
  // Keep an off-grid current value (e.g. 7 minutes) selectable and visible.
  if (current >= 0 && !values.includes(current)) values.push(current), values.sort((a, b) => a - b);
  return (
    <div className="w-14">
      <div className="mb-1 text-center text-[11px] font-semibold text-neutral-500">{label}</div>
      <div ref={ref} role="listbox" aria-label={label} className="h-56 space-y-0.5 overflow-y-auto pr-0.5">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            role="option"
            aria-selected={v === current}
            onClick={() => onPick(v)}
            className={cn(
              "block w-full rounded-lg py-1 text-center text-sm tabular-nums transition",
              v === current ? "bg-brand font-bold text-brand-ink" : "hover:bg-neutral-100 dark:hover:bg-white/10"
            )}
          >
            {pad(v)}
          </button>
        ))}
      </div>
    </div>
  );
}
