import React from "react";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

export const runtime = "edge";

export default function TermsOfServicePage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 sm:px-8 pt-24 sm:pt-28 pb-12 space-y-8 text-neutral-800 dark:text-neutral-300">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Return to Home
        </Link>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-neutral-900 dark:text-white flex items-center gap-3">
          <FileText className="h-8 w-8 text-[#00a9d2]" /> Terms of Service
        </h1>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">Last updated: August 2026</p>
      </div>

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
            For questions, legal inquiries, or terms clarification, please reach out via our official Discord, or our email, <a href="mailto:federaltelevision.net@gmail.com" className="text-[#00a9d2] hover:underline font-semibold">federaltelevision.net@gmail.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
