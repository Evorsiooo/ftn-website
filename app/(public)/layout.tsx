export const runtime = "edge";
import { GsDialogHost } from "@/components/gs/dialogs";
import { PlusTransitionHandler } from "@/components/gs/plus-transition-handler";
import { GsHeader } from "@/components/gs/header";
import { GsOnAir } from "@/components/gs/on-air";
import { GsFooter } from "@/components/gs/footer";
import { PlusNowProvider } from "@/components/plus-promo/plus-now-context";
import { PlusMiniBar } from "@/components/plus-promo/plus-mini-bar";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlusNowProvider>
      <PlusTransitionHandler />
      <GsDialogHost />
      <div className="gs flex min-h-screen flex-col">
        <GsHeader />
        <GsOnAir />
        <main className="flex-1">{children}</main>
        <GsFooter />
      </div>
      <PlusMiniBar />
    </PlusNowProvider>
  );
}
