import type { DbClient } from "@/db";
import type { RobloxUser } from "@/lib/auth";
import type { RefKind } from "./names";

export type JsonSchema = Record<string, unknown>;

export interface RouteCall {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  form?: FormData;
  params?: Record<string, string>;
}

 
export type RouteHandler = (req: any, ctx: any) => Promise<Response>;

export interface ToolCtx {
  db: DbClient;
  user: RobloxUser;
  /** "Claude", "ChatGPT"... as the app registered itself */
  aiName: string;
  grantId: string;
  origin: string;
  ip: string;
  /** Calls one of the site's own API routes as this person (same permission checks as the buttons). */
  call: (handler: RouteHandler, opts: RouteCall) => Promise<any>;  
}

export type ToolKind = "read" | "write" | "danger";

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  input: Record<string, JsonSchema>;
  required?: string[];
  /** read: looks only. write: changes something. danger: hard to undo or public (marked destructive, so the AI app asks the person first). */
  kind: ToolKind;
  /** For write tools that are risky only with some arguments (e.g. a bulk action that deletes): also marked destructive. */
  dangerIf?: (args: any) => boolean;  
  /** Reaches outside FTN (Discord, YouTube, the downloader). */
  openWorld?: boolean;
  /** Which arguments are ids of what, so summaries can show names instead (lib/mcp/names.ts). */
  refs?: Record<string, RefKind>;
  /** One line describing this call, for the audit log and the approval page. */
  summary?: (args: any) => string;  
  /** Its result holds a new password meant for the person: sent to the AI unredacted. */
  showsSecret?: boolean;
  /** Inputs that take a file the person attached in the chat (ChatGPT's openai/fileParams). */
  fileParams?: string[];
  run: (ctx: ToolCtx, args: any) => Promise<unknown>;  
}

export class ToolError extends Error {}

/** Small helpers for input schemas. */
export const S = {
  str: (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: "string", description, ...extra }),
  int: (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: "integer", description, ...extra }),
  num: (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: "number", description, ...extra }),
  bool: (description: string): JsonSchema => ({ type: "boolean", description }),
  enum: (values: readonly string[], description: string): JsonSchema => ({ type: "string", enum: [...values], description }),
  strArr: (description: string): JsonSchema => ({ type: "array", items: { type: "string" }, description }),
  obj: (description: string, properties?: Record<string, JsonSchema>): JsonSchema =>
    properties ? { type: "object", description, properties } : { type: "object", description, additionalProperties: true },
};

/** Copies only the listed keys that were given (so "not given" never overwrites a field). */
export function pick<T extends Record<string, unknown>>(args: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (args[k] !== undefined) out[k] = args[k];
  return out;
}
