import { ToolDef } from "../types";
import { metaTools } from "./meta";
import { articleTools } from "./articles";
import { postTools } from "./posts";
import { radioTools } from "./radio";
import { adTools } from "./ads";
import { siteTools } from "./site";

/** Every tool, in a fixed order (clients cache the list). */
export const TOOLS: ToolDef[] = [...metaTools, ...articleTools, ...postTools, ...radioTools, ...adTools, ...siteTools];
export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export function isDangerous(tool: ToolDef, args: Record<string, unknown>): boolean {
  return tool.kind === "danger" || (!!tool.dangerIf && tool.dangerIf(args));
}

export function toolListing() {
  return TOOLS.map((t) => {
    const risky = t.kind === "danger" || !!t.dangerIf;
    return {
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: { type: "object", properties: t.input, ...(t.required?.length ? { required: t.required } : {}) },
      annotations: {
        title: t.title,
        readOnlyHint: t.kind === "read",
        destructiveHint: t.kind !== "read" && risky,
        idempotentHint: t.kind === "read",
        openWorldHint: !!t.openWorld,
      },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["admin"] }] },
    };
  });
}
