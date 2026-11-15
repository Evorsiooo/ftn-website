// Serves the lab like the website would: the built page, the time endpoint
// and the radio bucket's files (from a local folder). For local and headless
// tests only.
//   BUCKET_DIR=<folder mirroring the ftn-radio bucket> PORT=8787 JITTER_MS=0 node tools/lab-server.mjs
// JITTER_MS adds a random 0..JITTER_MS delay to each time response (one way),
// so the clock sync is tested against an uneven network.
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// the website's own checks (Node strips the types)
import { checkAnalysis, checkTimelineChange } from '../../../lib/radio/autodj.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const PAGE_DIR = join(here, '../../../public');
const BUCKET_DIR = process.env.BUCKET_DIR;
const PORT = Number(process.env.PORT ?? 8787);
const JITTER_MS = Number(process.env.JITTER_MS ?? 0);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream',
};

function sendFile(req, res, path) {
  let st;
  try { st = statSync(path); if (st.isDirectory()) { path = join(path, 'index.html'); st = statSync(path); } } catch { res.writeHead(404).end('not found'); return; }
  const type = TYPES[extname(path)] ?? 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
    const end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes' });
    createReadStream(path, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': type.startsWith('text/html') ? 'no-store' : 'public, max-age=3600' });
  createReadStream(path).pipe(res);
}

const AUTODJ_KEY = 'test/autodj.json';
const analysisKey = (songKey) => `test/analysis/${songKey.split('/').pop()}.json`;
const readJson = (key) => (existsSync(join(BUCKET_DIR, key)) ? JSON.parse(readFileSync(join(BUCKET_DIR, key), 'utf8')) : null);
const writeJson = (key, value) => {
  mkdirSync(dirname(join(BUCKET_DIR, key)), { recursive: true });
  writeFileSync(join(BUCKET_DIR, key), JSON.stringify(value));
};
const library = () => new Map(readJson('test/songs.json').map((s) => [s.key, s]));
const body = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 2_000_000) reject(new Error('too big'));
    });
    req.on('end', () => resolve(data));
  });
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = decodeURIComponent(url.pathname);
  if (path === '/api/radio/autodj') {
    if (req.method === 'GET') {
      const tl = readJson(AUTODJ_KEY);
      return tl ? json(res, 200, tl) : json(res, 404, { error: 'nothing stored' });
    }
    if (req.method === 'POST') {
      try {
        const { timeline } = JSON.parse(await body(req));
        const current = readJson(AUTODJ_KEY);
        const error = checkTimelineChange(current, timeline, Date.now(), library());
        if (error) return json(res, current && timeline?.rev !== current.rev + 1 ? 409 : 422, { error });
        writeJson(AUTODJ_KEY, timeline);
        return json(res, 200, { rev: timeline.rev });
      } catch (e) {
        return json(res, 400, { error: String(e) });
      }
    }
  }
  if (path.startsWith('/api/radio/analysis/')) {
    const songKey = normalize(path.slice('/api/radio/analysis/'.length));
    const lib = library();
    if (!lib.has(songKey)) return json(res, 404, { error: 'not in the library' });
    const stored = readJson(analysisKey(songKey));
    if (req.method === 'GET' || req.method === 'HEAD') return stored ? json(res, 200, stored) : json(res, 404, { error: 'not analysed yet' });
    if (req.method === 'PUT') {
      if (stored) return json(res, 200, { kept: 'first one' });
      try {
        const a = JSON.parse(await body(req));
        const error = checkAnalysis(a, songKey, lib.get(songKey));
        if (error) return json(res, 422, { error });
        writeJson(analysisKey(songKey), a);
        return json(res, 201, { stored: true });
      } catch (e) {
        return json(res, 400, { error: String(e) });
      }
    }
  }
  if (path === '/api/radio/time') {
    const reply = () => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ clientMs: Number(url.searchParams.get('c')), serverMs: Date.now() }));
    };
    if (JITTER_MS > 0) setTimeout(reply, Math.random() * JITTER_MS);
    else reply();
    return;
  }
  if (path.startsWith('/api/radio/file/')) {
    const key = normalize(path.slice('/api/radio/file/'.length));
    if (key.startsWith('..') || !BUCKET_DIR) { res.writeHead(400).end(); return; }
    sendFile(req, res, join(BUCKET_DIR, key));
    return;
  }
  if (path.startsWith('/labs/radio-engine')) {
    const rel = normalize(path.slice(1));
    if (rel.startsWith('..')) { res.writeHead(400).end(); return; }
    sendFile(req, res, join(PAGE_DIR, rel));
    return;
  }
  res.writeHead(404).end('not found');
}).listen(PORT, () => console.log(`lab on http://localhost:${PORT}/labs/radio-engine/`));
