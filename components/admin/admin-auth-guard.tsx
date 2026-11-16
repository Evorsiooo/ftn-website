"use client";
import { fetchSession } from "@/lib/session-client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DivisionRole, hasPermission } from "@/lib/rbac";

interface AdminAuthGuardProps {
  children: React.ReactNode;
  requiredRoles?: DivisionRole[];
  requiredPermission?: (roles: string[]) => boolean;
  featureTitle?: string;
}

export function AdminAuthGuard({
  children,
  requiredRoles,
  requiredPermission,
  featureTitle,
}: AdminAuthGuardProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authenticatedUser, setAuthenticatedUser] = useState<any | null>(null);
  const [hasRoleAccess, setHasRoleAccess] = useState(false);

  useEffect(() => {
    fetchSession()
      .then((data: any) => {
        if (
          data &&
          data.authenticated &&
          data.user &&
          Array.isArray(data.user.roles) &&
          data.user.roles.length > 0
        ) {
          const user = data.user;
          const userRoles: string[] = user.roles || [];
          setAuthenticatedUser(user);

          // Check role-specific permissions if specified
          if (requiredPermission) {
            setHasRoleAccess(requiredPermission(userRoles));
          } else if (requiredRoles && requiredRoles.length > 0) {
            const allowed = requiredRoles.some((role) =>
              hasPermission(userRoles, role)
            );
            setHasRoleAccess(allowed);
          } else {
            // General staff check
            setHasRoleAccess(true);
          }
        } else {
          setAuthenticatedUser(null);
          setHasRoleAccess(false);
          router.replace("/?error=staff_authentication_required");
        }
      })
      .catch(() => {
        setAuthenticatedUser(null);
        setHasRoleAccess(false);
        router.replace("/?error=staff_authentication_required");
      })
      .finally(() => setChecking(false));
  }, [router, requiredRoles, requiredPermission]);

  if (checking) {
    return <div className="pane-empty" style={{ flex: 1 }}>Checking your access…</div>;
  }

  // Case 1: Unauthenticated
  if (!authenticatedUser) {
    return (
      <div className="pane-empty" style={{ flex: 1 }}>
        <div className="card" style={{ maxWidth: 420, padding: 24, display: "grid", gap: 14, textAlign: "left" }}>
          <h1 className="t20" style={{ margin: 0, fontWeight: 600, color: "var(--a-text)" }}>Staff sign-in needed</h1>
          <p style={{ margin: 0 }}>The admin is only for FTN staff. Sign in with the Roblox account that has your staff role.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/api/auth/roblox" className="btn primary">Sign in with Roblox</Link>
            <Link href="/" className="btn ghost">Back to the site</Link>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: signed in, but this page needs a role they don't have
  if (!hasRoleAccess) {
    return (
      <div className="pane-empty" style={{ flex: 1 }}>
        <div className="card" style={{ maxWidth: 420, padding: 24, display: "grid", gap: 14, textAlign: "left" }}>
          <h1 className="t20" style={{ margin: 0, fontWeight: 600, color: "var(--a-text)" }}>{featureTitle || "This page"} isn&apos;t part of your role</h1>
          <p style={{ margin: 0 }}>
            You&apos;re signed in as @{authenticatedUser.robloxUsername}. Ask a site admin for access if you need it.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/admin" className="btn strong">Go to Today</Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
