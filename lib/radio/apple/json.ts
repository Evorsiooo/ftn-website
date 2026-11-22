// BitChord's JSON readers for Apple's catalogue (web/app/src/data/apple/artistPage.ts).
export type Json = Record<string, unknown>;
export const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
export const str = (v: unknown): string => (typeof v === 'string' ? v : '');
export function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
