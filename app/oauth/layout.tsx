import "../(admin)/admin.css";
import "./oauth.css";

export const runtime = "edge";

// The "Connect an AI" pages use the admin panel's look, without its sidebar.
export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="adm oauth-page">{children}</div>;
}
