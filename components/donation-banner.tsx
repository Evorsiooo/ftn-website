import React from "react";
import { IconHeartHandshake, IconBrandDiscord } from "@tabler/icons-react";

const OPTIONS = [
  {
    bank: "Merchants Bank of Jamestown",
    url: "https://discord.gg/xJbtaC9cFT",
    steps: (
      <>
        Join the server, go to <strong>#check-or-invoice-services</strong>, and state your donation amount,
        addressed to <strong>United Capital Holdings</strong>.
      </>
    ),
  },
  {
    bank: "Chesapeake Credit Union",
    url: "https://discord.gg/Gvh7A2acSN",
    steps: (
      <>
        Join the server, go to <strong>#donate-ftn</strong>, and state your donation amount.
      </>
    ),
  },
];

export function DonationBanner() {
  return (
    <section
      aria-labelledby="donation-banner-title"
      className="w-full rounded-2xl border border-neutral-200 bg-white p-5 sm:p-7 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFBB14] text-black">
          <IconHeartHandshake className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <h2 id="donation-banner-title" className="text-xl sm:text-2xl font-black tracking-tight text-neutral-900 dark:text-white">
            FTN needs your help!
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
            FTN is independent and community-run. If you can, please chip in to keep the news and radio going.
            Pick whichever option is easiest for you:
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {OPTIONS.map((o, i) => (
          <div
            key={o.bank}
            className="flex flex-col justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="space-y-1.5">
              <div className="text-[11px] font-black uppercase tracking-wider text-[#00a9d2]">Option {i + 1}</div>
              <h3 className="font-bold text-base text-neutral-900 dark:text-white">{o.bank}</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">{o.steps}</p>
            </div>
            <a
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FFBB14] px-5 text-sm font-black text-black transition hover:bg-[#e5a710] active:scale-[0.98]"
            >
              <IconBrandDiscord className="h-4 w-4" /> Join {o.bank}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
