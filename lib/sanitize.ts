/**
 * Lightweight, zero-dependency HTML sanitizer for TipTap WYSIWYG article content
 * Protects against Cross-Site Scripting (XSS) attacks in Edge Runtime
 */

const ALLOWED_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "strike",
  "del",
  "u",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "code",
  "pre",
  "span",
  "div",
]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "width", "height", "class"]),
  span: new Set(["class"]),
  div: new Set(["class"]),
  code: new Set(["class"]),
  pre: new Set(["class"]),
  p: new Set(["class"]),
  h1: new Set(["class"]),
  h2: new Set(["class"]),
  h3: new Set(["class"]),
  blockquote: new Set(["class"]),
};

export function sanitizeHtml(dirtyHtml: string): string {
  if (!dirtyHtml || typeof dirtyHtml !== "string") return "";

  // 1. Remove dangerous executable tag blocks entirely
  let clean = dirtyHtml.replace(
    /<(script|iframe|object|embed|style|svg|form|input|button|link|meta)[\s\S]*?<\/\1>/gi,
    ""
  );
  clean = clean.replace(/<(script|iframe|object|embed|style|svg|form|input|button|link|meta)[^>]*?>/gi, "");

  // 2. Strip all inline on* event handlers (e.g. onerror=, onclick=, onload=)
  clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "");

  // 3. Strip javascript: and vbscript: URIs from attributes
  clean = clean.replace(/\s+(href|src)\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*"|javascript:[^\s>]+)/gi, "");
  clean = clean.replace(/\s+(href|src)\s*=\s*(?:'vbscript:[^']*'|"vbscript:[^"]*"|vbscript:[^\s>]+)/gi, "");
  clean = clean.replace(/\s+(href|src)\s*=\s*(?:'data:text\/html[^']*'|"data:text\/html[^"]*"|data:text\/html[^\s>]+)/gi, "");

  // 4. Validate remaining HTML tags against allowlist
  clean = clean.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (match, tagName, attributes) => {
    const lowerTag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(lowerTag)) {
      return ""; // Strip disallowed tag
    }

    if (match.startsWith("</")) {
      return `</${lowerTag}>`;
    }

    const isSelfClosing = match.endsWith("/>");
    const allowedAttrsForTag = ALLOWED_ATTRIBUTES[lowerTag] || new Set();

    // Filter attributes
    let sanitizedAttrs = "";
    const attrRegex = /([a-z0-9-]+)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s>]+))/gi;
    let attrMatch;

    while ((attrMatch = attrRegex.exec(attributes)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

      if (allowedAttrsForTag.has(attrName)) {
        // Enforce secure link targets
        if (lowerTag === "a" && attrName === "href") {
          const safeHref = attrValue.trim();
          if (
            safeHref.startsWith("http://") ||
            safeHref.startsWith("https://") ||
            safeHref.startsWith("/") ||
            safeHref.startsWith("#") ||
            safeHref.startsWith("mailto:")
          ) {
            sanitizedAttrs += ` href="${safeHref.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer"`;
          }
        } else if (lowerTag === "img" && attrName === "src") {
          const safeSrc = attrValue.trim();
          if (
            safeSrc.startsWith("http://") ||
            safeSrc.startsWith("https://") ||
            safeSrc.startsWith("/") ||
            safeSrc.startsWith("data:image/")
          ) {
            sanitizedAttrs += ` src="${safeSrc.replace(/"/g, "&quot;")}"`;
          }
        } else {
          sanitizedAttrs += ` ${attrName}="${attrValue.replace(/"/g, "&quot;")}"`;
        }
      }
    }

    return `<${lowerTag}${sanitizedAttrs}${isSelfClosing ? " />" : ">"}`;
  });

  return clean;
}
