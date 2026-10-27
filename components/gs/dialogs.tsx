"use client";
import React, { useEffect, useRef, useState } from "react";

/**
 * Site dialogs that replace the browser's alert, confirm and prompt boxes.
 * Mount <GsDialogHost /> once in a layout, then call toast(), confirmDialog() or promptDialog() from anywhere.
 */
type Toast = { id: number; message: string };
type Ask = { kind: "confirm" | "prompt"; message: string; value: string; resolve: (v: any) => void };

let pushToast: (message: string) => void = () => {};
let pushAsk: (a: Ask) => void = () => {};

export function toast(message: unknown) {
  pushToast(String(message));
}

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => pushAsk({ kind: "confirm", message, value: "", resolve }));
}

export function promptDialog(message: string, defaultValue = ""): Promise<string | null> {
  return new Promise((resolve) => pushAsk({ kind: "prompt", message, value: defaultValue, resolve }));
}

export function GsDialogHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [text, setText] = useState("");
  const idRef = useRef(0);

  useEffect(() => {
    pushToast = (message) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, message }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
    };
    pushAsk = (a) => {
      setText(a.value);
      setAsk(a);
    };
    return () => {
      pushToast = () => {};
      pushAsk = () => {};
    };
  }, []);

  const close = (result: boolean | string | null) => {
    ask?.resolve(result);
    setAsk(null);
  };

  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(ask.kind === "confirm" ? false : null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[200] flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-[#16110a] px-5 py-4 text-sm font-medium text-[#fff8e6] shadow-2xl">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
            <span className="flex-1">{t.message}</span>
            <button type="button" aria-label="Dismiss" className="cursor-pointer opacity-60 hover:opacity-100" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {ask && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => close(ask.kind === "confirm" ? false : null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-3xl bg-white text-neutral-900 shadow-2xl dark:bg-neutral-900 dark:text-white" onClick={(e) => e.stopPropagation()}>
            <div className="h-2 bg-brand" />
            <div className="space-y-4 p-6">
              <p className="whitespace-pre-line text-base font-semibold leading-snug">{ask.message}</p>
              {ask.kind === "prompt" && (
                <input
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && close(text)}
                  className="h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-800"
                />
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="h-10 cursor-pointer rounded-full border border-neutral-300 px-5 text-sm font-bold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800" onClick={() => close(ask.kind === "confirm" ? false : null)}>
                  Cancel
                </button>
                <button type="button" autoFocus={ask.kind === "confirm"} className="h-10 cursor-pointer rounded-full bg-brand px-5 text-sm font-bold text-brand-ink hover:bg-brand-hover" onClick={() => close(ask.kind === "confirm" ? true : text)}>
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
