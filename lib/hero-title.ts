// Big hero headlines (FTN+ home and the news home) shrink as the title gets longer,
// so a long video title stays a few lines tall instead of pushing into the menu bar
// or pushing the rest of the hero off screen. The full title is still shown on hover.
export type HeroTitleSize = "short" | "medium" | "long";

export function heroTitleSize(title: string | null | undefined): HeroTitleSize {
  const n = (title || "").trim().length;
  if (n <= 34) return "short";
  if (n <= 60) return "medium";
  return "long";
}
