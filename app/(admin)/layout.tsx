import { GsHeader } from "@/components/gs/header";
import { GsAdminShell } from "@/components/gs/admin-shell";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { PlusNowProvider } from "@/components/plus-promo/plus-now-context";

export const runtime = "edge";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlusNowProvider>
      <div className="gs flex min-h-screen flex-col text-neutral-900 dark:text-white">
        <GsHeader section="Admin" />
        <GsAdminShell>
          <main className="px-4 py-8 sm:px-8 sm:py-10">
            <AdminAuthGuard>{children}</AdminAuthGuard>
          </main>
        </GsAdminShell>
      </div>
    </PlusNowProvider>
  );
}
