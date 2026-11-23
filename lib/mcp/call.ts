import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import type { RobloxUser } from "@/lib/auth";
import { RouteCall, RouteHandler, ToolError } from "./types";

function jwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== "production" ? "ftn-local-development-only-jwt-secret" : "");
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

/** A 5-minute session for one AI call. The routes re-read the person's roles from the database. */
export async function shortSession(user: RobloxUser, aiName: string): Promise<string> {
  return new SignJWT({ user, via: "ai", ai: aiName })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(jwtSecret());
}

/**
 * Runs one of the site's own API route handlers in-process, as the person. Every permission check,
 * validation and side effect (Discord, R2, the downloader) is exactly the one the admin buttons use.
 */
export async function callRoute(
  handler: RouteHandler,
  opts: RouteCall,
  env: { origin: string; ip: string; session: string }
): Promise<unknown> {
  const url = new URL(opts.path, env.origin);
  for (const [k, v] of Object.entries(opts.query || {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const headers = new Headers({ authorization: `Bearer ${env.session}`, "cf-connecting-ip": env.ip, "x-ftn-via": "ai", origin: env.origin });
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.body);
  }
  const req = new NextRequest(url, { method: opts.method || "GET", headers, body });
  const res = await handler(req, { params: Promise.resolve(opts.params || {}) });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) {
    const msg = data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : `The site answered ${res.status}`;
    throw new ToolError(msg);
  }
  return data;
}
