import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";

export const runtime = "edge";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-black dark:text-white">
      <Navbar />
      <main className="flex-1">
        <AdminAuthGuard>{children}</AdminAuthGuard>
      </main>
      <Footer />
    </div>
  );
}
