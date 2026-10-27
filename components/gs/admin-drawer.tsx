"use client";
import React, { useEffect } from "react";
import { X } from "lucide-react";

/** A right-hand panel for creating or editing one thing without leaving the list behind it. */
export function AdminDrawer({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-y-0 right-0 flex w-full ${wide ? "max-w-3xl" : "max-w-xl"} flex-col overflow-y-auto border-l border-border bg-background text-foreground shadow-2xl`}
      >
        <div className="flex items-center justify-between bg-brand px-6 py-5 text-brand-ink">
          <h2 className="text-xl font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#16110a] text-[#fff8e6] hover:bg-black">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-6">{children}</div>
      </aside>
    </div>
  );
}
