// Deep links from the main site into FTN+. `ref` says which promo the visit came from.
export type PlusRef = "hero" | "band" | "strip" | "nav" | "article" | "minibar" | "footer" | "picks";

export function plusHref(path: string, ref: PlusRef): string {
  return `${path}${path.includes("?") ? "&" : "?"}ref=news-${ref}`;
}

export const watchPath = (youtubeId: string) => `/plus/watch/${encodeURIComponent(youtubeId)}`;

// Opens the small radio player so the visitor can keep reading while it plays.
export function openRadioPopout() {
  const win = window.open("/plus/radio/popout?autoplay=1", "ftn-radio-popout", "popup=yes,width=380,height=640");
  if (!win) window.location.href = plusHref("/plus/radio", "band");
}
