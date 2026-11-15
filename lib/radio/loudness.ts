// Integrated loudness (ITU-R BS.1770-4 / EBU R128), the radio engine's code (labs/radio-engine,
// src/radio/loudness.ts). Used by the Library page for uploaded files, which have no YouTube
// loudness_db figure: the uploader's browser measures it and stores LUFS + 14 on the same scale.

/** K-weighting biquads for [sr], as pyloudnorm derives them (exact at 48 kHz). */
function kWeighting(sr: number): { b: number[]; a: number[] }[] {
  // stage 1: high shelf
  let G = 3.99984385397;
  let Q = 0.7071752369554193;
  let fc = 1681.974450955533;
  let K = Math.tan((Math.PI * fc) / sr);
  let Vh = Math.pow(10, G / 20);
  let Vb = Math.pow(Vh, 0.499666774155);
  let a0 = 1 + K / Q + K * K;
  const shelf = {
    b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
    a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  };
  // stage 2: high pass
  G = 0;
  Q = 0.5003270373253953;
  fc = 38.13547087613982;
  K = Math.tan((Math.PI * fc) / sr);
  a0 = 1 + K / Q + K * K;
  const hp = { b: [1, -2, 1], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  void G;
  return [shelf, hp];
}

function filter(x: Float32Array<ArrayBufferLike>, { b, a }: { b: number[]; a: number[] }): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const [b0, b1, b2] = b as [number, number, number];
  const [, a1, a2] = a as [number, number, number];
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    y[i] = yi;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
  }
  return y;
}

/** Integrated loudness in LUFS of a decoded song (mono or stereo). */
export function integratedLufs(buffer: AudioBuffer): number {
  const sr = buffer.sampleRate;
  const stages = kWeighting(sr);
  const channels: Float32Array<ArrayBufferLike>[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) {
    let x: Float32Array<ArrayBufferLike> = buffer.getChannelData(c);
    for (const s of stages) x = filter(x, s);
    channels.push(x);
  }
  const block = Math.round(0.4 * sr);
  const step = Math.round(0.1 * sr);
  const powers: number[] = [];
  for (let start = 0; start + block <= buffer.length; start += step) {
    let sum = 0;
    for (const x of channels) {
      let ss = 0;
      for (let i = start; i < start + block; i++) ss += x[i]! * x[i]!;
      sum += ss / block;
    }
    powers.push(sum);
  }
  const lufs = (p: number) => -0.691 + 10 * Math.log10(p);
  const abs = powers.filter((p) => lufs(p) > -70);
  if (!abs.length) return -70;
  const meanAbs = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = abs.filter((p) => lufs(p) > lufs(meanAbs) - 10);
  return lufs(rel.reduce((a, b) => a + b, 0) / rel.length);
}

/** YouTube's reference: loudness_db 0 is about -14 LUFS, so loudnessDb = LUFS + 14. */
export const YOUTUBE_REFERENCE_LUFS = -14;
