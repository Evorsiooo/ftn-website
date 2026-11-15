import { defineConfig } from 'vite';

// The radio engine, built into the website's public folder (public/radio-engine/):
// - site.js: what the website's radio player loads when someone presses Listen;
// - index.html: the test page (/radio-engine/index.html), not linked from the site.
// onnxruntime-web's 14 MB .wasm is served from the radio bucket (models/), not shipped with the page
const dropOrtWasm = () => ({
  name: 'drop-ort-wasm',
  generateBundle(_options: unknown, bundle: Record<string, unknown>) {
    for (const name of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(name)) delete bundle[name];
  },
});

export default defineConfig({
  plugins: [dropOrtWasm()],
  base: '/radio-engine/',
  build: {
    outDir: '../public/radio-engine',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: { lab: 'index.html', site: 'src/site.ts' },
      preserveEntrySignatures: 'exports-only',
      output: {
        entryFileNames: (chunk) => (chunk.name === 'site' ? 'site.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  // BitChord's vite.config: essentia.js's Emscripten glue breaks under dep pre-bundling, and the worker is a module.
  optimizeDeps: { exclude: ['essentia.js'] },
  worker: {
    format: 'es',
    plugins: () => [dropOrtWasm()],
  },
});
