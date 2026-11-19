"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/*
 * Small SVG charts for the Stats page (no chart library). One y axis per chart, thin marks, a recessive
 * grid, and a hover crosshair with a tooltip. Colours come from --s1/--s2 in admin.css (light and dark
 * steps of a palette checked for colour-blind contrast).
 */

export type Series = { name: string; color?: "s1" | "s2"; kind: "line" | "area" | "bar"; values: (number | null)[] };

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
export const fmtNum = (n: number | null | undefined) => (n == null ? "–" : nf.format(n));

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function useWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [w, setW] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  // a callback ref, so a chart that first shows a message still measures itself once it draws
  const ref = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    ro.current = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.current.observe(el);
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);
  return [ref, w];
}

/** A bar with 4px rounded ends at the top, anchored to the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function Chart({
  labels,
  tips,
  series,
  height = 180,
  unit = "",
  empty = "No data yet",
  hide,
}: {
  /** One label per point (x axis). */
  labels: string[];
  /** Longer label per point for the tooltip (defaults to labels). */
  tips?: string[];
  series: Series[];
  height?: number;
  unit?: string;
  empty?: string;
  /** Show this message instead of the chart. */
  hide?: string;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const max = useMemo(() => niceMax(Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v != null)))), [series]);
  const hasData = series.some((s) => s.values.some((v) => v != null && v > 0));

  const top = 8;
  const bottom = 22;
  const yLabels = [max, max / 2, 0];
  const left = Math.max(...yLabels.map((v) => fmtNum(v).length)) * 7 + 10;
  const right = 8;
  const plotW = Math.max(0, width - left - right);
  const plotH = height - top - bottom;
  const hasBars = series.some((s) => s.kind === "bar");
  const step = n > 0 ? plotW / (hasBars ? n : Math.max(1, n - 1)) : 0;
  const xAt = (i: number) => left + (hasBars ? step * (i + 0.5) : n === 1 ? plotW / 2 : step * i);
  const yAt = (v: number) => top + plotH - (v / max) * plotH;

  const bars = series.filter((s) => s.kind === "bar");
  const barGap = 2;
  const groupW = Math.max(1, Math.min(28 * bars.length, step * 0.72));
  const barW = Math.max(1, (groupW - barGap * (bars.length - 1)) / Math.max(1, bars.length));

  const linePath = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const areaPath = (vals: (number | null)[]) => {
    // one closed shape per run of values
    let d = "";
    let run: number[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const base = yAt(0).toFixed(1);
      d += `M${xAt(run[0]).toFixed(1)},${base}` + run.map((i) => `L${xAt(i).toFixed(1)},${yAt(vals[i]!).toFixed(1)}`).join("") + `L${xAt(run[run.length - 1]).toFixed(1)},${base}Z`;
      run = [];
    };
    vals.forEach((v, i) => (v == null ? flush() : run.push(i)));
    flush();
    return d;
  };

  // about one x label per 90px
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 90))));
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - left;
    const i = hasBars ? Math.floor(x / step) : Math.round(x / step);
    setHover(i >= 0 && i < n ? i : null);
  };

  const tipLeft = hover != null ? Math.min(Math.max(xAt(hover) - 80, 0), Math.max(0, width - 160)) : 0;

  if (hide)
    return (
      <div className="chart" style={{ height: 48 }}>
        <div className="chart-empty" style={{ inset: 0 }}>
          {hide}
        </div>
      </div>
    );
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${series.map((s) => s.name).join(", ")} chart`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {yLabels.map((v, i) => (
            <g key={i}>
              <line x1={left} x2={width - right} y1={yAt(v)} y2={yAt(v)} className={v === 0 ? "axis" : "grid"} />
              <text x={left - 6} y={yAt(v) + 4} textAnchor="end" className="tick">
                {fmtNum(v)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % every === 0 ? (
              <text key={i} x={xAt(i)} y={height - 6} textAnchor={hasBars || (i > 0 && i < n - 1) ? "middle" : i === 0 ? "start" : "end"} className="tick">
                {l}
              </text>
            ) : null,
          )}
          {hover != null && !hasBars && <line x1={xAt(hover)} x2={xAt(hover)} y1={top} y2={top + plotH} className="cross" />}
          {hover != null && hasBars && <rect x={xAt(hover) - step / 2} y={top} width={step} height={plotH} className="band" />}
          {series.map((s, si) => {
            const c = `var(--${s.color ?? "s1"})`;
            if (s.kind === "bar") {
              const bi = bars.indexOf(s);
              return (
                <g key={si} fill={c}>
                  {s.values.map((v, i) => {
                    if (!v) return null;
                    const x = xAt(i) - groupW / 2 + bi * (barW + barGap);
                    return <path key={i} d={barPath(x, yAt(v), barW, yAt(0) - yAt(v))} />;
                  })}
                </g>
              );
            }
            return (
              <g key={si}>
                {s.kind === "area" && <path d={areaPath(s.values)} fill={c} opacity={0.16} />}
                <path d={linePath(s.values)} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {/* lone points (no neighbours) still show */}
                {s.values.map((v, i) =>
                  v != null && s.values[i - 1] == null && s.values[i + 1] == null ? <circle key={i} cx={xAt(i)} cy={yAt(v)} r={3} fill={c} /> : null,
                )}
                {hover != null && s.values[hover] != null && <circle cx={xAt(hover)} cy={yAt(s.values[hover]!)} r={4} fill={c} stroke="var(--a-surface)" strokeWidth={2} />}
              </g>
            );
          })}
        </svg>
      )}
      {!hasData && <div className="chart-empty">{empty}</div>}
      {hover != null && hasData && (
        <div className="chart-tip" style={{ left: tipLeft }}>
          <div className="t12 muted">{(tips ?? labels)[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="row">
              <span className="sw" style={{ background: `var(--${s.color ?? "s1"})` }} />
              <span className="grow">{s.name}</span>
              <b className="num">
                {fmtNum(s.values[hover])}
                {unit}
              </b>
            </div>
          ))}
        </div>
      )}
      <table className="sr-only">
        <thead>
          <tr>
            <th>When</th>
            {series.map((s) => (
              <th key={s.name}>{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={i}>
              <td>{(tips ?? labels)[i]}</td>
              {series.map((s) => (
                <td key={s.name}>{fmtNum(s.values[i])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: "s1" | "s2"; kind?: "line" | "bar" }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.name}>
          <span className={i.kind === "line" ? "sw line" : "sw"} style={{ background: `var(--${i.color})` }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

/** A headline number with its label and a short line under it. */
export function Kpi({ label, value, sub }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="kpi">
      <div className="t12 muted">{label}</div>
      <div className="v num">{value}</div>
      {sub != null && <div className="t12 muted trunc">{sub}</div>}
    </div>
  );
}

/** A horizontal bar beside a label, for top-10 lists (share of the largest). */
export function RankList({ rows, unit = "", empty = "Nothing yet" }: { rows: { key: string; label: React.ReactNode; sub?: React.ReactNode; value: number; extra?: React.ReactNode }[]; unit?: string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <div className="rank-empty">{empty}</div>;
  return (
    <ol className="rank">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="lbl-row">
            <span className="grow trunc">
              {r.label}
              {r.sub && <span className="muted"> · {r.sub}</span>}
            </span>
            <b className="num">
              {fmtNum(r.value)}
              {unit}
            </b>
            {r.extra}
          </div>
          <div className="track">
            <i style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------- time helpers ----------

/** Every UTC day from `days` ago to today, as YYYY-MM-DD. */
export function dayList(days: number, now = Date.now()): string[] {
  const out: string[] = [];
  const n = Math.max(1, days);
  for (let i = n - 1; i >= 0; i--) out.push(new Date(now - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

/** Values for each day of `list` from rows keyed by day (missing days are 0). */
export function byDay<T extends { day: string }>(list: string[], rows: T[], pick: (r: T) => number): number[] {
  const m = new Map(rows.map((r) => [r.day, pick(r)]));
  return list.map((d) => m.get(d) ?? 0);
}

export const dayLabel = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short" });
export const dayTip = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
