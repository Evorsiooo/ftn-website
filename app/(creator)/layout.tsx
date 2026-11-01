import { GsDialogHost } from "@/components/gs/dialogs";

export const runtime = "edge";

// The Creator is a full-screen tool: no site navbar, no admin sidebar.
export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GsDialogHost />
      {children}
    </>
  );
}
