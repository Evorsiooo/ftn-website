import { useEffect } from "react";

/** Sets the tab title for data-driven client pages (e.g. a league name) once it is known. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} | FTN+`;
  }, [title]);
}
