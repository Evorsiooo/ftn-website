import "./admin.css";
import { GsDialogHost } from "@/components/gs/dialogs";
import { PlusTransitionHandler } from "@/components/gs/plus-transition-handler";
import { AdminFrame } from "@/components/admin/ui/shell";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { PlusNowProvider } from "@/components/plus-promo/plus-now-context";

export const runtime = "edge";

// The admin has its own frame (sidebar and page bar), not the public site's header.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlusNowProvider>
      <PlusTransitionHandler />
      <div className="adm">
        <GsDialogHost variant="admin" />
        <AdminFrame>
          <AdminAuthGuard>{children}</AdminAuthGuard>
        </AdminFrame>
      </div>
    </PlusNowProvider>
  );
}
