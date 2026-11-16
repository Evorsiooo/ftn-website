"use client";
import React, { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "@/components/gs/dialogs";
import { Sheet } from "@/components/admin/ui";

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
      className="btn sm"
    >
      {done ? <Check className="ic-sm" /> : <Copy className="ic-sm" />} {done ? "Copied" : "Copy"}
    </button>
  );
}

function SettingsList({ items }: { items: Setting[] }) {
  return (
    <dl className="rows" style={{ margin: 0 }}>
      {items.map((s) => (
        <div key={s.label} className="r">
          <div className="grow">
            <dt className="t12 muted">{s.label}</dt>
            <dd style={{ margin: 0, fontWeight: 500, overflowWrap: "anywhere" }}>{s.value}</dd>
          </div>
          {s.copy && <CopyButton text={s.copy} label={s.label} />}
        </div>
      ))}
    </dl>
  );
}

/** Step-by-step OBS setup for broadcasting to the web radio. Opened from Settings, Radio. */
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
            <li>Your show added to the Schedule, so listeners see when you are live.</li>
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
            <div className="lbl">File path or URL</div>
            <div className="card flex flex-wrap items-center gap-2 p-2">
              <span className="min-w-0 flex-1 break-all px-1 font-mono text-[13px]">{shownUrl}</span>
              {password && (
                <button
                  type="button"
                  onClick={() => setRevealed((v) => !v)}
                  aria-label="Show or hide password"
                  className="iconbtn"
                >
                  {revealed ? <EyeOff className="ic" /> : <Eye className="ic" />}
                </button>
              )}
              {password && <CopyButton text={url} label="Stream URL" />}
            </div>
            {loaded && !password && (
              <p className="err">
                No broadcast password is recorded on the site yet. Ask the Broadcast Division for it and replace [BROADCAST PASSWORD] in the URL.
              </p>
            )}
            <p className="help">The password changes over time. Come back here to copy the current URL before every show.</p>
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
          <li>Check the On air line at the top of the Schedule to see yourself live.</li>
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
    <Sheet
      title={`Step ${step + 1} of ${steps.length}: ${current.title}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)} style={{ marginRight: "auto" }}>
            <ChevronLeft className="ic" /> Back
          </button>
          {last ? (
            <button type="button" className="btn strong" onClick={onClose}>
              Done
            </button>
          ) : (
            <button type="button" className="btn strong" onClick={() => setStep(step + 1)}>
              Next <ChevronRight className="ic" />
            </button>
          )}
        </>
      }
    >
      <div className="meter" aria-hidden>
        <i style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>
      <div className="space-y-4 leading-relaxed">{current.body}</div>
    </Sheet>
  );
}
