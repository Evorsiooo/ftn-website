export const runtime = "edge";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PlusNowProvider } from "@/components/plus-promo/plus-now-context";
import { PlusMiniBar } from "@/components/plus-promo/plus-mini-bar";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlusNowProvider>
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
      <PlusMiniBar />
    </PlusNowProvider>
  );
}
