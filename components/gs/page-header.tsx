import React from "react";

/** The gold opening band of a page: a big title, an optional intro and an optional action row. */
export function GsPageHeader({
  eyebrow,
  title,
  description,
  children,
  overlap,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Leave room at the bottom so the first block of the page can overlap the band. */
  overlap?: boolean;
}) {
  return (
    <section className="bg-brand text-brand-ink">
      <div className={`mx-auto max-w-7xl px-4 pt-10 sm:px-8 sm:pt-14 ${overlap ? "pb-24 sm:pb-32" : "pb-10 sm:pb-14"}`}>
        {eyebrow && <div className="mb-3 text-xs font-bold uppercase tracking-widest opacity-75">{eyebrow}</div>}
        <h1 className="max-w-4xl text-4xl font-extrabold leading-[0.98] sm:text-6xl">{title}</h1>
        {description && <p className="mt-4 max-w-2xl text-lg opacity-85">{description}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}
