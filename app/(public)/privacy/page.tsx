import React from "react";
import { GsPageHeader } from "@/components/gs/page-header";

export const runtime = "edge";

export default function PrivacyPolicyPage() {
  return (
    <div className="text-neutral-800 dark:text-neutral-300">
      <GsPageHeader eyebrow="Last updated: August 2026" title="Privacy Policy" />
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-8">

      <div className="prose dark:prose-invert max-w-none space-y-6 text-sm sm:text-base leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white">1. Overview & Commitment</h2>
          <p>
            FTN Media operates an independent journalistic, civic coverage, and community digital network. We respect your privacy and are committed to protecting any information you share with us across our digital platforms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white">2. Information We Collect</h2>
          <p>
            <strong>Roblox Open Cloud Authentication:</strong> When you sign in using Roblox OAuth 2.0, we collect and store your verified Roblox User ID, username, display name, and avatar headshot. We do not receive or store your Roblox password.
          </p>
          <p>
            <strong>Anonymous Tipline:</strong> Information submitted via the tipline is transmitted directly to our editorial inbox without tracking headers, IP addresses, or browser footprints, unless you explicitly choose to share your username.
          </p>
          <p>
            <strong>Session Cookies:</strong> We utilize secure, HttpOnly session cookies to maintain your login session and enforce security access controls.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white">3. How We Use Information</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-neutral-700 dark:text-neutral-300">
            <li>To display user identity on comments and article discussions.</li>
            <li>To enforce community moderation and protect against profanity and spam.</li>
            <li>To grant verified staff permissions to authorized newsroom personnel.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white">4. Data Retention & Deletion</h2>
          <p>
            Users may sign out at any time to clear local session tokens. For inquiries regarding data deletion or moderation records, please reach out via our official Discord, or our email, <a href="mailto:federaltelevision.net@gmail.com" className="text-brand-text hover:underline font-semibold">federaltelevision.net@gmail.com</a>.
          </p>
        </section>
      </div>
      </div>
    </div>
  );
}
