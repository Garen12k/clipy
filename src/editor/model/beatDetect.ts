// Beat detection: onset envelope -> tempo -> beat grid. Plain arithmetic on a mono PCM signal; no imports, erasable TypeScript only
// (scripts/generate-beats.mjs loads this file with Node's type stripping). One constant tempo per track is assumed.

export const BEAT_DETECT = {
  /** Onset-envelope frames per second (the hop is the sample rate / this, rounded). */
  envelopeRate: 100,
  /** Analysis window in seconds (rounded up to a power of two samples). */
  windowSeconds: 0.023,
  /** The tempo search range, and where the preference is centred (a log-normal weight, `priorOctaves` wide). */
  minBpm: 70, maxBpm: 180, priorBpm: 120, priorOctaves: 1,
  /** The fine search around the coarse tempo: +- this share of the period, in this many steps each way. */
  fineSpan: 0.03, fineSteps: 300,
  /** Log compression of the magnitudes before the difference. */
  compress: 1000,
} as const;

export interface BeatAnalysis {
  /** Beats per minute, 2 decimals. */
  bpm: number;
  /** Seconds from the start of the file to the first beat, 3 decimals. */
  first: number;
  /** Every beat inside the file, seconds, 3 decimals, ascending. */
  beats: number[];
  /** Mean onset strength on the beats over the mean everywhere: about 1 = no better than chance; 2 and more = a clear pulse. */
  confidence: number;
}

const nextPow2 = (n: number): number => { let p = 1; while (p < n) p *= 2; return p; };

/** In-place radix-2 FFT of `re` / `im` (length a power of two). */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len *= 2) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/**
 * Spectral flux: per hop, the sum over frequency of the RISE in log-compressed magnitude since the previous hop. Frame `i` is the
 * window that ENDS at sample `(i + 1) * hop` (zero-padded before the start), so a sound that starts at time t shows in the frame
 * at about t * rate. Returns the envelope and its real frame rate.
 */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): { env: Float64Array; rate: number } {
  const hop = Math.max(1, Math.round(sampleRate / BEAT_DETECT.envelopeRate));
  const size = nextPow2(Math.ceil(sampleRate * BEAT_DETECT.windowSeconds));
  const frames = Math.floor(samples.length / hop);
  const env = new Float64Array(Math.max(0, frames));
  const hann = new Float64Array(size);
  for (let i = 0; i < size; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  const re = new Float64Array(size), im = new Float64Array(size);
  let prev = new Float64Array(size / 2), cur = new Float64Array(size / 2);
  for (let f = 0; f < frames; f++) {
    const end = (f + 1) * hop;
    for (let i = 0; i < size; i++) {
      const at = end - size + i;
      re[i] = at >= 0 && at < samples.length ? samples[at] * hann[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    let flux = 0;
    for (let k = 0; k < size / 2; k++) {
      cur[k] = Math.log(1 + BEAT_DETECT.compress * Math.hypot(re[k], im[k]) / size);
      const d = cur[k] - prev[k];
      if (d > 0) flux += d;
    }
    env[f] = f === 0 ? 0 : flux;
    const t = prev; prev = cur; cur = t;
  }
  return { env, rate: sampleRate / hop };
}

/** The envelope at a fractional frame (linear between frames; 0 outside). */
function at(env: Float64Array, x: number): number {
  if (!(x >= 0) || x > env.length - 1) return 0;
  const i = Math.floor(x), f = x - i;
  return i + 1 < env.length ? env[i] * (1 - f) + env[i + 1] * f : env[i];
}

/** The best phase (frames, 0 <= phase < period) for a grid of that period, and the mean envelope on its points. */
function bestPhase(env: Float64Array, period: number): { phase: number; mean: number } {
  let best = { phase: 0, mean: -1 };
  for (let phase = 0; phase < period; phase += 0.5) {
    let sum = 0, n = 0;
    for (let x = phase; x <= env.length - 1; x += period) { sum += at(env, x); n++; }
    const mean = n > 0 ? sum / n : 0;
    if (mean > best.mean) best = { phase, mean };
  }
  return best;
}

/**
 * The beat period in envelope frames: the autocorrelation peak between `maxBpm` and `minBpm`, weighted towards `priorBpm`, then
 * refined to the period whose best grid collects the most onset strength. 0 when the envelope is too short or flat.
 */
export function beatPeriod(env: Float64Array, rate: number): number {
  const lo = Math.max(2, Math.floor((60 * rate) / BEAT_DETECT.maxBpm)), hi = Math.ceil((60 * rate) / BEAT_DETECT.minBpm);
  if (env.length < hi * 4) return 0;
  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i];
  mean /= env.length;
  let coarse = 0, coarseScore = 0;
  for (let lag = lo; lag <= hi; lag++) {
    let acc = 0;
    for (let i = lag; i < env.length; i++) acc += (env[i] - mean) * (env[i - lag] - mean);
    acc /= env.length - lag;
    const octaves = Math.log2((60 * rate) / lag / BEAT_DETECT.priorBpm) / BEAT_DETECT.priorOctaves;
    const score = acc * Math.exp(-0.5 * octaves * octaves);
    if (score > coarseScore) { coarseScore = score; coarse = lag; }
  }
  if (coarse === 0) return 0;
  let fine = coarse, fineScore = -1;
  for (let s = -BEAT_DETECT.fineSteps; s <= BEAT_DETECT.fineSteps; s++) {
    const period = coarse * (1 + (BEAT_DETECT.fineSpan * s) / BEAT_DETECT.fineSteps);
    const { mean: m } = bestPhase(env, period);
    if (m > fineScore) { fineScore = m; fine = period; }
  }
  return fine;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Tempo, first beat and every beat of a mono signal; null when no steady pulse can be measured (too short, silent). */
export function detectBeats(samples: Float32Array, sampleRate: number): BeatAnalysis | null {
  if (!(sampleRate > 0) || samples.length < sampleRate * 4) return null;
  const { env, rate } = onsetEnvelope(samples, sampleRate);
  const period = beatPeriod(env, rate);
  if (!(period > 0)) return null;
  const { phase, mean } = bestPhase(env, period);
  let all = 0;
  for (let i = 0; i < env.length; i++) all += env[i];
  all /= env.length;
  if (!(all > 0)) return null;
  const duration = samples.length / sampleRate;
  const step = period / rate, first = phase / rate;
  const beats: number[] = [];
  for (let k = 0; first + k * step < duration; k++) beats.push(r3(first + k * step));
  return { bpm: Math.round((60 / step) * 100) / 100, first: r3(first), beats, confidence: Math.round((mean / all) * 100) / 100 };
}
