// The program (radio/program.json): shows, the Studio's queue and pause. Format shared with the website.
import { fileUrl } from './config';
import type { RadioProgram } from '../../../lib/radio/program-types';

export * from '../../../lib/radio/program-types';

export async function fetchProgram(): Promise<RadioProgram | null> {
  const r = await fetch(`${fileUrl('radio/program.json')}?t=${Date.now()}`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`program: HTTP ${r.status}`);
  return (await r.json()) as RadioProgram;
}
