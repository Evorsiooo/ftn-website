import { defineConfig } from 'vite';

// The lab is a static page served by the website at /labs/radio-engine/.
// Built into the website's public folder so a Pages preview serves it as is.
// onnxruntime-web's 14 MB .wasm is served from the radio bucket (models/), not shipped with the page
const dropOrtWasm = () => ({
  name: 'drop-ort-wasm',
  generateBundle(_options: unknown, bundle: Record<string, unknown>) {
    for (const name of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(name)) delete bundle[name];
  },
});

export default defineConfig({
  plugins: [dropOrtWasm()],
  base: '/labs/radio-engine/',
  build: {
    outDir: '../../public/labs/radio-engine',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  // BitChord's vite.config: essentia.js's Emscripten glue breaks under dep pre-bundling, and the worker is a module.
  optimizeDeps: { exclude: ['essentia.js'] },
  worker: {
    format: 'es',
    plugins: () => [dropOrtWasm()],
  },
});
