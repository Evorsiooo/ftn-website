"use client";
import React, { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Eye, EyeOff, X } from "lucide-react";
import { toast } from "@/components/gs/dialogs";
import { Button } from "@/components/ui/button";

const HOST = "198.12.81.100";
const PORT = "8000";

interface Setting {
  label: string;
  value: string;
  copy?: string;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(
      () => {
        setDone(true);
        toast(`${label} copied`);
        setTimeout(() => setDone(false), 1500);
      },
      () => toast("Could not copy. Select the text and copy it by hand.")
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-bold text-brand-ink hover:bg-brand-hover"
    >
      {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {done ? "Copied" : "Copy"}
    </button>
  );
}

function SettingsList({ items }: { items: Setting[] }) {
  return (
    <dl className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
      {items.map((s) => (
        <div key={s.label} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <dt className="text-xs font-bold uppercase tracking-widest text-neutral-500">{s.label}</dt>
            <dd className="mt-0.5 break-words font-mono text-sm">{s.value}</dd>
          </div>
          {s.copy && <CopyButton text={s.copy} label={s.label} />}
        </div>
      ))}
    </dl>
  );
}

/** Step-by-step OBS setup for broadcasting to the web radio. Opened from the Schedule page. */
export function RadioSetupWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/radio/password", { cache: "no-store" });
        if (res.ok) setPassword(((await res.json()) as { password: string | null }).password);
      } catch {
        /* the URL step explains what to do without a password */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const url = `icecast://source:${password ?? "[BROADCAST PASSWORD]"}@${HOST}:${PORT}/live`;
  const shownUrl = password && !revealed ? `icecast://source:${"•".repeat(12)}@${HOST}:${PORT}/live` : url;

  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "Before you start",
      body: (
        <>
          <p>This wizard sets up OBS to send your audio to the FTN web radio. You can stream to YouTube at the same time without changing your usual setup.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>OBS Studio installed, and you know the basics of it.</li>
            <li>Your show added to the schedule on this page, so listeners see when you are live.</li>
            <li>The current broadcast password. This wizard fills it in for you in step 3.</li>
          </ul>
        </>
      ),
    },
    {
      title: "Switch OBS to Advanced output",
      body: (
        <ol className="list-decimal space-y-2 pl-5">
          <li>Open OBS and go to <b>Settings</b>.</li>
          <li>Open the <b>Output</b> tab.</li>
          <li>Change <b>Output Mode</b> from <b>Simple</b> to <b>Advanced</b>.</li>
          <li>Open the <b>Recording</b> tab. Do not close Settings yet.</li>
        </ol>
      ),
    },
    {
      title: "Fill in the Recording tab",
      body: (
        <>
          <p>Set each field on the Recording tab as shown. Some may already be filled in.</p>
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">File path or URL</div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#16110a] p-3 text-[#fff8e6] dark:bg-black">
              <span className="min-w-0 flex-1 break-all px-1 font-mono text-sm">{shownUrl}</span>
              {password && (
                <button
                  type="button"
                  onClick={() => setRevealed((v) => !v)}
                  aria-label="Show or hide password"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#fff8e6]/10 hover:bg-[#fff8e6]/20"
                >
                  {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
              {password && <CopyButton text={url} label="Stream URL" />}
            </div>
            {loaded && !password && (
              <p className="text-sm text-red-600 dark:text-red-400">
                No broadcast password is recorded on the site yet. Ask the Broadcast Division for it and replace [BROADCAST PASSWORD] in the URL.
              </p>
            )}
            <p className="text-sm text-neutral-600 dark:text-neutral-400">The password changes over time. Come back here to copy the current URL before every show.</p>
          </div>
          <SettingsList
            items={[
              { label: "Type", value: "Custom Output (FFmpeg)" },
              { label: "FFmpeg Output Type", value: "Output to URL" },
              { label: "Container Format", value: "adts", copy: "adts" },
              { label: "Muxer Settings", value: "content_type=audio/aac", copy: "content_type=audio/aac" },
              { label: "Show all codecs", value: "Checked" },
              { label: "Video Encoder", value: "Disable Encoder" },
              { label: "Audio Bitrate", value: "128 Kbps" },
              { label: "Audio Track", value: "1 (unless you use a custom multi-track setup)" },
              { label: "Audio Encoder", value: "aac (Default Encoder)" },
              { label: "Audio Encoder Settings", value: "Leave blank" },
            ]}
          />
          <p>Click <b>Apply</b>, then <b>OK</b>.</p>
        </>
      ),
    },
    {
      title: "Go live",
      body: (
        <ol className="list-decimal space-y-2 pl-5">
          <li>Check that the <b>File path or URL</b> field holds the current password. If it is old, copy the URL from step 3 again.</li>
          <li>Click <b>Start Streaming</b> to start your usual YouTube livestream, if you have one.</li>
          <li>Click <b>Start Recording</b>. OBS treats the radio feed as a recording, so this is what sends your audio to the web radio.</li>
          <li>Check the On air strip at the top of this page to see yourself live.</li>
        </ol>
      ),
    },
    {
      title: "After your show",
      body: (
        <>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Click <b>Stop Recording</b> (and <b>Stop Streaming</b> if you were on YouTube).</li>
            <li>Go to <b>Settings</b>, then <b>Output</b>, and switch <b>Output Mode</b> back to <b>Simple</b>.</li>
          </ol>
          <p>Switching back stops OBS from sending background audio to the radio by accident. OBS remembers everything, so for your next show you only need to switch to Advanced again and update the URL.</p>
        </>
      ),
    },
  ];

  const last = step === steps.length - 1;
  const current = steps[step];

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Radio broadcast setup"
        className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-border bg-background text-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-brand px-6 py-5 text-brand-ink">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest opacity-70">Radio setup · Step {step + 1} of {steps.length}</div>
            <h2 className="text-xl font-extrabold">{current.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#16110a] text-[#fff8e6] hover:bg-black">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-1.5 px-6 pt-4" aria-hidden>
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-neutral-200 dark:bg-neutral-800"}`} />
          ))}
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6 text-sm leading-relaxed">{current.body}</div>
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <Button variant="outline" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)} className="h-10 cursor-pointer px-5 text-sm">
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {last ? (
            <Button size="sm" onClick={onClose} className="h-10 cursor-pointer px-5 text-sm">Done</Button>
          ) : (
            <Button size="sm" onClick={() => setStep(step + 1)} className="h-10 cursor-pointer px-5 text-sm">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}
