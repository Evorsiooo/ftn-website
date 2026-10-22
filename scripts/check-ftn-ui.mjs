#!/usr/bin/env node
// Guardrail for the FTN+ design system: new code in the FTN+ surface should use the tokens
// from app/globals.css and the components in components/ftn, not ad-hoc values.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["app/(ott)", "components/ott", "components/ftn", "components/sports"];
// The sidebar shell predates the tokens and is intentionally left as is.
const SHELL_ALLOWED = new Set(["app/(ott)/client-layout.tsx"]);

const rules = [
  { name: "hex colour", re: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g, skip: (line) => /themeColor|theme-color|shadow-\[/.test(line) },
  { name: "arbitrary text size (use the type scale)", re: /text-\[\d+(\.\d+)?(px|rem)\]/g },
  { name: "raw neutral/black/white palette (use ftn-* tokens)", re: /\b(bg|text|border)-(neutral-\d+|black\b(?!\/)|zinc-\d+|gray-\d+)/g, shellOk: true },
  { name: "hard-coded brand gold", re: /FFBB14|e5a710/gi, skip: (line) => /themeColor|theme-color|shadow-\[/.test(line) },
];

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(f)) out.push(p);
  }
  return out;
}

let problems = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative(".", file);
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const r of rules) {
          if (r.shellOk && SHELL_ALLOWED.has(rel)) continue;
          if (r.skip?.(line)) continue;
          for (const m of line.matchAll(r.re)) {
            console.error(`${rel}:${i + 1}  ${r.name}: ${m[0]}`);
            problems++;
          }
        }
      });
  }
}
if (problems) {
  console.error(`\n${problems} design-system violation(s). Use tokens from app/globals.css and components/ftn.`);
  process.exit(1);
}
console.log("FTN+ UI check passed.");
