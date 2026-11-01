import { FilterXSS, escapeAttrValue } from "xss";

/**
 * Sanitizer for TipTap article HTML, built on the `xss` library (a real HTML tokenizer with an
 * allowlist) instead of regular expressions. Runs on the server when an article is saved and in
 * the browser when it is shown; it needs no DOM, so it also works in the Edge runtime.
 */

const ALLOWED_TAGS: Record<string, string[]> = {
  h1: ["class"], h2: ["class"], h3: ["class"], h4: [], h5: [], h6: [],
  p: ["class"], br: [], hr: [],
  strong: [], b: [], em: [], i: [], s: [], strike: [], del: [], u: [],
  blockquote: ["class"], ul: [], ol: [], li: [],
  a: ["href", "title"],
  img: ["src", "alt", "title", "width", "height", "class"],
  code: ["class"], pre: ["class"], span: ["class"], div: ["class"],
};

const SAFE_HREF = /^(https?:\/\/|\/(?![\/\\])|#|mailto:)/i;
const SAFE_SRC = /^(https?:\/\/|\/(?![\/\\])|data:image\/(png|jpe?g|gif|webp);base64,)/i;

const filter = new FilterXSS({
  whiteList: ALLOWED_TAGS,
  stripIgnoreTag: true, // drop unknown tags, keep their text
  stripIgnoreTagBody: ["script", "style", "iframe", "object", "embed", "svg", "form", "input", "button", "link", "meta", "math", "template"],
  allowCommentTag: false,
  onTagAttr(tag, name, value) {
    if (tag === "a" && name === "href") {
      return SAFE_HREF.test(value.trim()) ? `href="${escapeAttrValue(value.trim())}"` : "";
    }
    if (tag === "img" && name === "src") {
      return SAFE_SRC.test(value.trim()) ? `src="${escapeAttrValue(value.trim())}"` : "";
    }
    return undefined; // other allowed attributes use the library's default escaping
  },
});

export function sanitizeHtml(dirtyHtml: string): string {
  if (!dirtyHtml || typeof dirtyHtml !== "string") return "";
  // Links open in a new tab without access to this page. Done on the already-filtered output.
  return filter.process(dirtyHtml).replace(/<a (?=href=)/g, '<a target="_blank" rel="noopener noreferrer" ');
}
