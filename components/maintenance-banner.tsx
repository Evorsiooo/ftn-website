// Site-wide "Under maintenance" banner. It reads nothing (no database, no API): to turn it off or
// change the text, edit MAINTENANCE below and deploy.
export const MAINTENANCE: string | null = "FTN is under maintenance. Some pages and the radio may not work right now. We'll be back shortly.";

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
