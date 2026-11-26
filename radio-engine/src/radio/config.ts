// Where the radio finds its files and the website's endpoints.
// Must stay worker-safe: the analysis worker imports MODEL_BASE.
//
// Reads (songs, models, the running order, shared analyses) go straight to
// the ftn-radio bucket's public domain, so they cost the website no Worker
// requests. Writes and the clock go to the website, which checks them.
// The lab's local server overrides the files base (globalThis.__FTN_RADIO_FILES__).
const override = (globalThis as { __FTN_RADIO_FILES__?: string }).__FTN_RADIO_FILES__;
export const FILES_BASE = override ?? 'https://radio-files.euno.cc';
const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');
export const fileUrl = (key: string) => `${FILES_BASE}/${encodeKey(key)}`;
/** The analysis models and the onnxruntime .wasm, stored in the radio bucket under models/. */
export const MODEL_BASE = `${FILES_BASE}/models`;

/** Keep in step with lib/radio/store.ts (the website writes these objects). */
export const AUTODJ_KEY = 'radio/autodj.json';
export const analysisKey = (songKey: string) => `analysis/${songKey}.json`;
/** Key, tempo and energy of every shared analysis (kept by the website's every-minute cron). */
export const ANALYSIS_INDEX_KEY = 'radio/analysis-index.json';

export const TIME_URL = '/api/radio/time';
/** The songs the AutoDJ may play (the library, managed in the admin panel). */
export const LIBRARY_URL = '/api/radio/library';
/** The AutoDJ's running order: read from the bucket, a longer one POSTed here (checked by the website). */
export const AUTODJ_WRITE_URL = '/api/radio/autodj';
/** Mixes the safety checks refused, reported for the radio check (lib/radio/mix-reports.ts). */
export const MIX_REPORT_URL = '/api/radio/mix-report';
/** A song's shared analysis: read from the bucket, PUT here once (checked by the website). */
export const analysisWriteUrl = (key: string) => `/api/radio/analysis/${encodeKey(key)}`;
