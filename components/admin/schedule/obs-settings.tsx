"use client";
import React, { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Copy, RefreshCw, Loader2 } from "lucide-react";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import { formatWhen } from "@/components/admin/ui";
import { RadioSetupWizard } from "./radio-setup-wizard";

interface PasswordInfo {
  password: string | null;
  lastRotatedAt: number | null;
  rotationFrequencyHours: number;
  rotationTimeUtc: string;
  rotationConfigured: boolean;
}

/**
 * Broadcasting from OBS instead of the Studio (Settings, Radio): the source password the DJ needs,
 * changing it now, and the setup guide.
 */
export function ObsSettings() {
  const [pw, setPw] = useState<PasswordInfo | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [guide, setGuide] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/radio/password");
      if (res.ok) setPw((await res.json()) as PasswordInfo);
    } catch {
      /* the strip still shows what is on air */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rotate = async () => {
    if (!(await confirmDialog("Change the broadcast password now? Anyone streaming from OBS is cut off until they enter the new one.", { ok: "Change now", danger: true }))) return;
    setRotating(true);
    try {
      const res = await fetch("/api/admin/radio/password", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        toast(data.error || "Rotation failed");
        return;
      }
      setPw(data as PasswordInfo);
      setRevealed(true);
    } finally {
      setRotating(false);
    }
  };

  const copy = () => {
    if (!pw?.password) return;
    navigator.clipboard.writeText(pw.password).then(() => toast("Password copied"), () => {});
  };

  return (
    <>
      <div className="field">
        <label>Broadcast password</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="input" readOnly value={pw?.password ? (revealed ? pw.password : "••••••••••••••••") : "None recorded yet"} style={{ flex: "1 1 200px", fontFamily: "ui-monospace, monospace", fontSize: 13 }} aria-label="Broadcast password" />
          {pw?.password && (
            <>
              <button type="button" onClick={() => setRevealed((v) => !v)} aria-label={revealed ? "Hide password" : "Show password"} className="btn icon">
                {revealed ? <EyeOff className="ic" /> : <Eye className="ic" />}
              </button>
              <button type="button" onClick={copy} className="btn">
                <Copy className="ic" /> Copy
              </button>
            </>
          )}
        </div>
        <div className="help">
          {pw?.lastRotatedAt ? `Changed ${formatWhen(pw.lastRotatedAt)}. ` : "Never changed from this site. "}
          {pw && pw.rotationFrequencyHours > 0 ? `Changes by itself every ${pw.rotationFrequencyHours} hours at ${pw.rotationTimeUtc} UTC.` : "Automatic changes are off."} Presenters always find the current one here.
        </div>
      </div>
      <div>
        <button type="button" onClick={() => setGuide(true)} className="btn">
          OBS setup guide
        </button>
      </div>
      <div className="danger-zone">
        <div className="line">
          <div>
            <div style={{ fontWeight: 500 }}>Change the password now</div>
            <div className="help">{pw && !pw.rotationConfigured ? "Set up password rotation under Integrations first." : "Anyone streaming from OBS is cut off until they enter the new one."}</div>
          </div>
          <button type="button" onClick={rotate} disabled={rotating || !pw?.rotationConfigured} className="btn danger">
            {rotating ? <Loader2 className="ic spin" /> : <RefreshCw className="ic" />} Change now
          </button>
        </div>
      </div>
      {guide && <RadioSetupWizard onClose={() => setGuide(false)} />}
    </>
  );
}
