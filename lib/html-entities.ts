const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hyphen: "‐", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", copy: "©", reg: "®",
  eacute: "é", egrave: "è", agrave: "à", aacute: "á", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  uuml: "ü", ouml: "ö", auml: "ä", ccedil: "ç", szlig: "ß", times: "×",
};

function decodeOnce(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return match;
      return String.fromCodePoint(code);
    }
    return NAMED[body.toLowerCase()] ?? match;
  });
}

// Decodes HTML entities in track metadata. Icecast and the art APIs sometimes escape text
// twice ("a&amp;#8208;ha"), so this repeats until stable (bounded). Output is plain text only.
export function decodeEntities(input: string): string {
  let out = input;
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}
