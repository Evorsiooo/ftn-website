// Maintenance mode. While MAINTENANCE is set, middleware.ts answers every page with a full-screen
// "Under maintenance" page (and every API with 503), reading nothing. To turn it off, set it to
// null and deploy.
export const MAINTENANCE: string | null = "FTN is undergoing maintenance. We'll be back shortly.";

export function MaintenanceBanner() {
  if (!MAINTENANCE) return null;
  return (
    <div
      role="status"
      style={{
        position: "relative",
        zIndex: 1000,
        background: "#ffbb14",
        color: "#041e41",
        padding: "10px 16px",
        textAlign: "center",
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      {MAINTENANCE}
    </div>
  );
}
