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
      className="grid gap-8 rounded-[2rem] bg-brand p-7 text-brand-ink sm:p-10 lg:grid-cols-[1fr_1.5fr] lg:gap-10"
    >
      <div className="space-y-3">
        <IconHeartHandshake className="h-9 w-9" />
        <h2 id="donation-banner-title" className="text-4xl font-extrabold leading-[1.02] sm:text-5xl">
          FTN needs your help!
        </h2>
        <p className="text-base leading-relaxed opacity-85">
          FTN is independent and community-run. If you can, please chip in to keep the news and radio going.
          Pick whichever option is easiest for you.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {OPTIONS.map((o, i) => (
          <div key={o.bank} className="flex flex-col gap-2 rounded-3xl bg-[#fff8e6] p-6 text-[#16110a] dark:bg-[#16110a] dark:text-[#fff3d6]">
            <div className="text-xs font-bold uppercase tracking-widest opacity-60">Option {i + 1}</div>
            <h3 className="text-xl font-bold leading-tight">{o.bank}</h3>
            <p className="flex-1 text-sm leading-relaxed opacity-80">{o.steps}</p>
            <a
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex h-11 items-center gap-2 self-start rounded-full bg-[#16110a] px-5 text-sm font-bold text-brand transition hover:bg-black dark:bg-brand dark:text-brand-ink dark:hover:bg-brand-hover"
            >
              <IconBrandDiscord className="h-4 w-4" /> Join {o.bank}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
