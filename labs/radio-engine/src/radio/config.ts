// Where the lab finds the website's radio endpoints. Same origin: the lab is
// served by the website (or by tools/lab-server.mjs, which mimics it).
// Must stay worker-safe: the analysis worker imports MODEL_BASE.
export const FILE_BASE = '/api/radio/file';
/** The analysis models and the onnxruntime .wasm, stored in the radio bucket under models/. */
export const MODEL_BASE = `${FILE_BASE}/models`;
export const TIME_URL = '/api/radio/time';
export const TIMELINE_KEY = 'test/timeline.json';
export const SONGS_KEY = 'test/songs.json';
export const fileUrl = (key: string) => `${FILE_BASE}/${key.split('/').map(encodeURIComponent).join('/')}`;
/** The AutoDJ's running order: GET it, POST a longer one (checked by the website). */
export const AUTODJ_URL = '/api/radio/autodj';
/** A song's shared analysis: GET it, PUT it once (checked by the website). */
export const analysisUrl = (key: string) => `/api/radio/analysis/${key.split('/').map(encodeURIComponent).join('/')}`;
