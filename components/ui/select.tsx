"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PopoverPanel } from "@/components/ui/popover-panel";

type Opt = { value: string; label: React.ReactNode; text: string; disabled?: boolean; group?: string };

function nodeText(n: React.ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join("");
  if (React.isValidElement(n)) return nodeText((n.props as { children?: React.ReactNode }).children);
  return "";
}

function collect(children: React.ReactNode, group: string | undefined, out: Opt[]) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as {
      value?: string | number;
      label?: string;
      disabled?: boolean;
      children?: React.ReactNode;
    };
    if (child.type === "option") {
      const text = nodeText(props.children);
      out.push({
        value: props.value !== undefined ? String(props.value) : text,
        label: props.children,
        text,
        disabled: props.disabled,
        group,
      });
    } else if (child.type === "optgroup") {
      collect(props.children, props.label, out);
    } else {
      collect(props.children, group, out);
    }
  });
}

export type SelectChange = { target: { value: string; name?: string }; currentTarget: { value: string; name?: string } };

export interface SelectProps {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: SelectChange) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
  title?: string;
  children?: React.ReactNode;
}

/**
 * Drop-in replacement for a native select with <option> children. Same value / onChange(e.target.value)
 * contract, but with a themed trigger and list that match the site in light and dark.
 */
export function Select({ value, defaultValue, onChange, name, id, disabled, className, children, ...rest }: SelectProps) {
  const options: Opt[] = [];
  collect(children, undefined, options);

  const [inner, setInner] = React.useState(String(defaultValue ?? ""));
  const current = value !== undefined ? String(value) : inner;
  const selected = options.find((o) => o.value === current);

  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const list = React.useRef<HTMLDivElement | null>(null);
  const typed = React.useRef({ text: "", t: 0 });
  const uid = React.useId();

  const close = React.useCallback(() => setOpen(false), []);

  const openList = () => {
    if (disabled) return;
    const i = options.findIndex((o) => o.value === current && !o.disabled);
    setActive(i >= 0 ? i : options.findIndex((o) => !o.disabled));
    setOpen(true);
  };

  const choose = (o: Opt) => {
    if (o.disabled) return;
    if (value === undefined) setInner(o.value);
    const target = { value: o.value, name };
    onChange?.({ target, currentTarget: target });
    close();
    trigger.current?.focus();
  };

  const move = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
    return from;
  };

  React.useEffect(() => {
    if (!open || active < 0) return;
    list.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => move(a, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => move(a, -1));
        break;
      case "Home":
        e.preventDefault();
        setActive(move(-1, 1));
        break;
      case "End":
        e.preventDefault();
        setActive(move(options.length, -1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (active >= 0) choose(options[active]);
        break;
      case "Tab":
        close();
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const now = Date.now();
          typed.current.text = now - typed.current.t > 700 ? e.key : typed.current.text + e.key;
          typed.current.t = now;
          const q = typed.current.text.toLowerCase();
          const i = options.findIndex((o) => !o.disabled && o.text.toLowerCase().startsWith(q));
          if (i >= 0) setActive(i);
        }
    }
  };

  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${uid}-list` : undefined}
        aria-label={rest["aria-label"]}
        title={rest.title}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex items-center justify-between gap-2 text-left transition focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", !selected && "opacity-50")}>{selected ? selected.label : "Select…"}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <PopoverPanel anchor={trigger} open={open} onClose={close} matchWidth minWidth={160} panelRef={list} className="p-1">
        <div id={`${uid}-list`} role="listbox" tabIndex={-1}>
          {options.map((o, i) => {
            const header = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <React.Fragment key={`${o.value}-${i}`}>
                {header ? (
                  <div className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">{header}</div>
                ) : null}
                <div
                  role="option"
                  aria-selected={o.value === current}
                  aria-disabled={o.disabled}
                  data-idx={i}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm",
                    i === active && "bg-neutral-100 dark:bg-white/10",
                    o.value === current && "font-semibold",
                    o.disabled && "cursor-not-allowed opacity-40"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.value === current ? <Check className="h-4 w-4 shrink-0 text-brand-text" aria-hidden /> : null}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </PopoverPanel>
    </>
  );
}
