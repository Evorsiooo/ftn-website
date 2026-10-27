import React from "react";
import { GsPageHeader } from "@/components/gs/page-header";

export const runtime = "edge";

export default function TermsOfServicePage() {
  return (
    <div className="text-neutral-800 dark:text-neutral-300">
      <GsPageHeader eyebrow="Last updated: August 2026" title="Terms of Service" />
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-8">

      <div className="prose dark:prose-invert max-w-none space-y-6 text-sm sm:text-base leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white">1. Acceptance of Terms</h2>
          <p>
            By accessing or using the FTN Media website, digital broadcasts, FTN+ streaming platform, and community forums, you agree to be bound by these Terms of Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white">2. Community Guidelines & Discussion Rules</h2>
          <p>
            When participating in article discussions or submitting tips, users agree to uphold respectful discourse. Prohibited conduct includes:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-neutral-700 dark:text-neutral-300">
            <li>Posting severe profanity, hate speech, harassment, or defamatory remarks.</li>
            <li>Spamming, flooding, or exploiting automated scripts to inflate metrics.</li>
            <li>Impersonating official FTN staff, civic representatives, or community members.</li>
          </ul>
          <p>
            Violations of these standards may result in automated or administrative muting of commenting privileges.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white">3. Editorial Content & Copyright</h2>
          <p>
            All articles, investigative reports, audio streams, and original broadcast footage published on FTN Media are the intellectual property of FTN Media and respective contributing columnists. Content may be quoted with proper journalistic attribution.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white">4. Modifications</h2>
          <p>
            FTN Media reserves the right to amend these terms at any time to reflect platform evolution and security standards.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white">5. Contact Us</h2>
          <p>
            For questions, legal inquiries, or terms clarification, please reach out via our official Discord, or our email, <a href="mailto:federaltelevision.net@gmail.com" className="text-brand-text hover:underline font-semibold">federaltelevision.net@gmail.com</a>.
          </p>
        </section>
      </div>
      </div>
    </div>
  );
}
