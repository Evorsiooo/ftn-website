import React from "react";

/** Top of every admin page: the page title, one line of what it is for, and the page's main actions. */
export function AdminPageHeader({
  title,
  description,
  actions,
  tabs,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-4xl font-extrabold leading-none sm:text-5xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-neutral-200 dark:border-neutral-800">{tabs}</div>}
    </div>
  );
}

/** One tab in an admin page header: an underlined text button, not a chip. */
export function AdminTab({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 cursor-pointer border-b-4 px-4 py-3 text-sm font-bold transition ${
        active ? "border-brand text-neutral-900 dark:text-white" : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
