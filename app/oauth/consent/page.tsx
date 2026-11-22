import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/auth";
import { canUseAi, verifyAuthRequest } from "@/lib/mcp/oauth";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const metadata = { title: "Connect an AI to FTN", robots: { index: false } };

function Logo() {
  return (
    <>
      <img src="/logos/ftn_text_transparent.png" alt="FTN" className="logo dark:hidden" />
      <img src="/logos/ftn_textwhite_transparent.png" alt="FTN" className="logo hidden dark:block" />
    </>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="card oauth-card">
      <Logo />
      <h1>{title}</h1>
      {children}
    </main>
  );
}

// The Allow page an AI app (Claude, ChatGPT, Gemini) sends the person to when they connect it.
export default async function ConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  if (q.error) {
    return (
      <Message title="Couldn't connect">
        <p className="muted">{q.error}</p>
      </Message>
    );
  }
  const r = q.r || "";
  const req = await verifyAuthRequest(r);
  if (!req) {
    return (
      <Message title="This link has expired">
        <p className="muted">Go back to the AI app and connect FTN again.</p>
      </Message>
    );
  }

  const token = (await cookies()).get("ftn_session")?.value;
  const user = token ? await verifySessionToken(token) : null;
  const here = `/oauth/consent?r=${r}`;
  if (!user) {
    return (
      <Message title={`Sign in to connect ${req.clientName}`}>
        <p className="muted">Sign in with your FTN account first. You&rsquo;ll come back here to allow it.</p>
        <div className="actions">
          <a className="btn primary" href={`/api/auth/roblox?returnUrl=${encodeURIComponent(here)}`}>
            Sign in with Roblox
          </a>
        </div>
      </Message>
    );
  }
  if (!canUseAi(user.roles)) {
    return (
      <Message title="Not available for your account">
        <p className="muted">For now, only Site Administrators can connect an AI to FTN.</p>
        <form method="post" action="/api/oauth/authorize" className="actions">
          <input type="hidden" name="r" value={r} />
          <button className="btn" name="decision" value="deny">
            Go back
          </button>
        </form>
      </Message>
    );
  }

  const host = new URL(req.redirectUri).host;
  return (
    <Message title={`Allow ${req.clientName} to use FTN as you?`}>
      <div className="who">
        {user.avatarUrl && <img src={user.avatarUrl} alt="" />}
        <div className="trunc">
          <div className="trunc" style={{ fontWeight: 600 }}>{user.displayName}</div>
          <div className="t12 muted trunc">@{user.robloxUsername}</div>
        </div>
      </div>
      <ul>
        <li>It can do what you can do in the admin panel: articles, the schedule, the song library, ads, sports and more.</li>
        <li>Anything it publishes shows your name. The audit log shows it as &ldquo;{user.robloxUsername}&rsquo;s {req.clientName}&rdquo;.</li>
        <li>Deleting things, publishing to Discord, roles and settings wait for you to approve each one on this site.</li>
      </ul>
      <p className="note">
        You&rsquo;ll be sent back to {host}. You can disconnect it at any time in Settings, AI access.
      </p>
      <form method="post" action="/api/oauth/authorize" className="actions">
        <input type="hidden" name="r" value={r} />
        <button className="btn" name="decision" value="deny">
          Cancel
        </button>
        <button className="btn primary" name="decision" value="allow">
          Allow
        </button>
      </form>
    </Message>
  );
}
