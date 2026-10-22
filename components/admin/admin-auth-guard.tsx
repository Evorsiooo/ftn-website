"use client";
import { fetchSession } from "@/lib/session-client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldAlert, Lock, ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center space-y-3 text-neutral-400 text-xs">
          <div className="h-6 w-6 border-2 border-[#00a9d2] border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Verifying staff permissions...</p>
        </div>
      </div>
    );
  }

  // Case 1: Unauthenticated
  if (!authenticatedUser) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-5 p-8 rounded-3xl border border-red-200 bg-white shadow-xl dark:border-red-900/50 dark:bg-neutral-950 dark:shadow-2xl">
          <div className="h-16 w-16 rounded-2xl bg-red-100 border border-red-300 dark:bg-red-950/40 dark:border-red-800 flex items-center justify-center text-red-600 dark:text-red-400 mx-auto">
            <ShieldAlert className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black text-neutral-900 dark:text-white">Access Denied</h1>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              This area is restricted strictly to verified staff members with assigned division roles. You must be authenticated with a verified staff account.
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <Link href="/api/auth/roblox">
              <Button className="w-full bg-[#00a9d2] hover:bg-[#0090b3] text-white font-bold text-xs h-10 shadow-sm cursor-pointer">
                <Lock className="h-3.5 w-3.5 mr-1.5" /> Sign In with Roblox
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" className="w-full border-neutral-300 text-xs text-neutral-700 hover:text-black dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-white cursor-pointer">
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Return to News Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Authenticated staff member without specific division role
  if (!hasRoleAccess) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-5 p-8 rounded-3xl border border-red-200 bg-white shadow-xl dark:border-red-900/50 dark:bg-neutral-950 dark:shadow-2xl">
          <div className="h-16 w-16 rounded-2xl bg-red-100 border border-red-300 dark:bg-red-950/40 dark:border-red-800 flex items-center justify-center text-red-600 dark:text-red-400 mx-auto">
            <ShieldAlert className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black text-neutral-900 dark:text-white">Restricted Division Area</h1>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              You are signed in as <strong className="text-neutral-900 dark:text-white">@{authenticatedUser.robloxUsername}</strong>, but your account does not have permission to access <strong className="text-neutral-800 dark:text-neutral-200">{featureTitle || "this console"}</strong>.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-left space-y-1 text-[11px]">
            <div className="text-neutral-600 dark:text-neutral-400">
              Your Roles:{" "}
              <span className="text-[#00a9d2] font-semibold">
                {authenticatedUser.roles?.map((r: string) => r.replace("_", " ")).join(", ") || "None"}
              </span>
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <Link href="/admin">
              <Button className="w-full bg-[#00a9d2] hover:bg-[#0090b3] text-white font-bold text-xs h-10 cursor-pointer shadow-sm">
                <Shield className="h-3.5 w-3.5 mr-1.5" /> Return to Staff Hub
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" className="w-full border-neutral-300 text-xs text-neutral-700 hover:text-black dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-white cursor-pointer">
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Return to News Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
