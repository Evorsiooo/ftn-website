import { cn } from "@/lib/utils";

/** The FTN+ wordmark, switching with the site theme (navy on light, white on dark). */
export function FtnPlusLogo({ className }: { className?: string }) {
  return (
    <>
      <img
        src="/logos/ftnplus_text_transparent.png"
        alt="FTN+"
        className={cn("w-auto object-contain object-left dark:hidden", className)}
      />
      <img
        src="/logos/ftnplus_textwhite_transparent.png"
        alt="FTN+"
        className={cn("w-auto object-contain object-left hidden dark:block", className)}
      />
    </>
  );
}

/** The gold plus mark alone. */
export function FtnPlusMark({ className }: { className?: string }) {
  return <img src="/logos/ftnplus_cropped_transparent.png" alt="FTN+" className={cn("w-auto object-contain", className)} />;
}
