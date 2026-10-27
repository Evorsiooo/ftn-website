// Animated hand-off between the main site (gold) and FTN+ (dark). The overlay is a plain DOM node on
// document.body, so it survives the client-side route change and fades out over FTN+'s own splash,
// which looks the same (dark ground, white wordmark, gold glow). Falls back to a plain navigation
// when the viewer prefers reduced motion.

const GOLD = "#ffbb14";
const DARK = "#07080b";
const EASE = "cubic-bezier(0.65, 0, 0.35, 1)";

export type TransitionOrigin = { x: number; y: number };

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function layer(color: string, origin: TransitionOrigin): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `position:absolute;inset:0;background:${color};clip-path:circle(0px at ${origin.x}px ${origin.y}px);`;
  return el;
}

function expand(el: HTMLElement, origin: TransitionOrigin, duration: number, delay = 0) {
  const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y)) + 8;
  return el.animate(
    [{ clipPath: `circle(0px at ${origin.x}px ${origin.y}px)` }, { clipPath: `circle(${radius}px at ${origin.x}px ${origin.y}px)` }],
    { duration, delay, easing: EASE, fill: "forwards" }
  );
}

function logo(src: string, height: number, withGlow: boolean): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;";
  if (withGlow) {
    const glow = document.createElement("div");
    glow.style.cssText = "position:absolute;width:288px;height:288px;border-radius:9999px;background:rgba(255,187,20,0.25);filter:blur(64px);";
    wrap.appendChild(glow);
  }
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.style.cssText = `position:relative;height:${height}px;width:auto;max-width:280px;object-fit:contain;${withGlow ? "filter:drop-shadow(0 0 35px rgba(255,187,20,0.4));" : ""}`;
  wrap.appendChild(img);
  return wrap;
}

function fadeIn(el: HTMLElement, delay: number, duration = 320) {
  el.animate(
    [{ opacity: 0, transform: "scale(0.9)" }, { opacity: 1, transform: "scale(1)" }],
    { duration, delay, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }
  );
}

function mount(): HTMLDivElement {
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = "position:fixed;inset:0;z-index:2147483000;pointer-events:all;";
  document.body.appendChild(root);
  return root;
}

/** Fades the overlay out once the new route is showing (and the animation has had its minimum time), or after a hard cap. */
function finishWhenArrived(root: HTMLElement, arrived: () => boolean, minMs: number, capMs: number, onCap?: () => void) {
  const started = Date.now();
  const timer = window.setInterval(() => {
    const elapsed = Date.now() - started;
    const done = elapsed >= minMs && arrived();
    if (!done && elapsed < capMs) return;
    window.clearInterval(timer);
    if (!done) onCap?.();
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 480, easing: "ease-in-out", fill: "forwards" });
    window.setTimeout(() => root.remove(), 520);
  }, 80);
}

/** Main site to FTN+: navigation starts at once; gold ink spreads from the click, dark follows, the wordmark appears, then it fades into FTN+'s splash. */
export function enterFtnPlus(origin: TransitionOrigin, navigate: () => void) {
  navigate();
  if (reducedMotion()) return;
  const root = mount();
  const gold = layer(GOLD, origin);
  const dark = layer(DARK, origin);
  const mark = logo("/logos/ftnplus_textwhite_transparent.png", 72, true);
  [gold, dark, mark].forEach((n) => root.appendChild(n));
  expand(gold, origin, 520);
  expand(dark, origin, 560, 220);
  fadeIn(mark, 560);
  finishWhenArrived(root, () => window.location.pathname.startsWith("/plus"), 1250, 6000);
}

/** FTN+ to the main site: navigation starts at once under a gold wipe with the FTN wordmark; it lifts when the main site has arrived. */
export function leaveFtnPlus(origin: TransitionOrigin, navigate: () => void, fallback?: () => void) {
  navigate();
  if (reducedMotion()) return;
  const root = mount();
  const gold = layer(GOLD, origin);
  const mark = logo("/logos/ftn_text_transparent.png", 52, false);
  [gold, mark].forEach((n) => root.appendChild(n));
  expand(gold, origin, 520);
  fadeIn(mark, 380);
  finishWhenArrived(root, () => !window.location.pathname.startsWith("/plus"), 1000, 7000, fallback);
}

export function originOf(e: { clientX: number; clientY: number; currentTarget: EventTarget }): TransitionOrigin {
  const t = e.currentTarget as HTMLElement | null;
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
  const r = t?.getBoundingClientRect?.();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}
