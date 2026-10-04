// Generates the bundled sound effects: ten mono 44.1 kHz 16-bit PCM WAV files plus manifest.json.
// Usage: node scripts/generate-sfx.mjs [outDir]   (default: assets/sfx)
// Plain Node, no dependencies. Fully deterministic: noise comes from a seeded LCG, nothing reads
// the clock or Math.random, so running it twice gives byte-identical .wav files (manifest.json is the same JSON).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 44100;
const PEAK = 0.6; // every sound is normalised to this fraction of full scale
const FADE_SEC = 0.005; // fade in and out to avoid clicks
const TAU = Math.PI * 2;

// Seeded linear congruential generator (Numerical Recipes constants). Returns floats in [-1, 1).
function makeNoise(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

const n = (sec) => Math.round(sec * RATE);
const buf = (sec) => new Float64Array(n(sec));
const clamp01 = (x) => Math.min(1, Math.max(0, x));
// Smooth attack (raised cosine over `attack` s) times exponential decay with time constant `tau` s.
const env = (t, attack, tau) => (t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : 1) * Math.exp(-t / tau);
// One-pole low-pass: y += a * (x - y). Smaller `a` is softer.
function lowpass(x, a) {
  let y = 0;
  for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; }
  return x;
}
// Phase-accumulating sine so a changing frequency stays click-free. freqAt(t) in Hz.
function sweep(sec, freqAt) {
  const out = buf(sec);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    out[i] = Math.sin(phase);
    phase += (TAU * freqAt(t)) / RATE;
  }
  return out;
}

// whoosh (0.6 s): white noise softened by a one-pole low-pass, shaped by a swell that peaks
// early (progress^0.75 through a sine-squared bell) and falls away, so it breathes in and out.
function whoosh() {
  const rnd = makeNoise(12345);
  const out = buf(0.6);
  for (let i = 0; i < out.length; i++) out[i] = rnd();
  lowpass(out, 0.18);
  for (let i = 0; i < out.length; i++) {
    const p = i / out.length;
    out[i] *= Math.pow(Math.sin(Math.PI * Math.pow(p, 0.75)), 2);
  }
  return out;
}

// swoosh (0.35 s): noise through a band whose centre rises (a low-pass minus a lower low-pass,
// both opening with time), with a fast-in / medium-out bell envelope.
function swoosh() {
  const rnd = makeNoise(12345);
  const out = buf(0.35);
  let hi = 0, lo = 0;
  for (let i = 0; i < out.length; i++) {
    const p = i / out.length;
    const x = rnd();
    hi += (0.08 + 0.35 * p) * (x - hi);
    lo += (0.02 + 0.12 * p) * (x - lo);
    out[i] = (hi - lo) * Math.pow(Math.sin(Math.PI * Math.pow(p, 0.6)), 2);
  }
  return out;
}

// pop (0.12 s): sine gliding 400 -> 100 Hz (exponential glide) with a 3 ms attack and fast decay.
function pop() {
  const out = sweep(0.12, (t) => 400 * Math.pow(100 / 400, t / 0.12));
  for (let i = 0; i < out.length; i++) out[i] *= env(i / RATE, 0.003, 0.03);
  return out;
}

// click (0.1 s): a 2 ms burst of softened noise plus a 1.5 kHz ping decaying over ~10 ms,
// padded with silence to 0.1 s.
function click() {
  const rnd = makeNoise(12345);
  const out = buf(0.1);
  const burst = lowpass(Float64Array.from({ length: n(0.002) }, rnd), 0.5);
  for (let i = 0; i < burst.length; i++) out[i] += 0.8 * burst[i] * (1 - i / burst.length);
  for (let i = 0; i < n(0.05); i++) {
    const t = i / RATE;
    out[i] += Math.sin(TAU * 1500 * t) * env(t, 0.0005, 0.01);
  }
  return out;
}

// ding (0.9 s): sines at 1320 Hz and 1980 Hz (a fifth apart; the upper one at half level)
// with a 2 ms attack and exponential decay (tau 0.18 s).
function ding() {
  const out = buf(0.9);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    out[i] = (Math.sin(TAU * 1320 * t) + 0.5 * Math.sin(TAU * 1980 * t)) * env(t, 0.002, 0.18);
  }
  return out;
}

// beep (0.2 s): 880 Hz "square-ish" tone: a sine plus its odd harmonics at 1/3 and 1/5, which
// is a rounded square; 8 ms attack, flat sustain, 20 ms release.
function beep() {
  const out = buf(0.2);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const w = TAU * 880 * t;
    const a = clamp01(t / 0.008) * clamp01((0.2 - t) / 0.02);
    out[i] = (Math.sin(w) + Math.sin(3 * w) / 3 + Math.sin(5 * w) / 5) * a;
  }
  return out;
}

// riser (1.5 s): sine sweeping 200 -> 2000 Hz (exponential) while the volume grows with
// progress squared (from 10% to full).
function riser() {
  const out = sweep(1.5, (t) => 200 * Math.pow(10, t / 1.5));
  for (let i = 0; i < out.length; i++) {
    const p = i / out.length;
    out[i] *= 0.1 + 0.9 * p * p;
  }
  return out;
}

// drop (0.7 s): sine sweeping 800 -> 60 Hz (exponential) with a 3 ms attack and a decay
// (tau 0.3 s) so it fades as it falls in pitch.
function drop() {
  const out = sweep(0.7, (t) => 800 * Math.pow(60 / 800, t / 0.7));
  for (let i = 0; i < out.length; i++) out[i] *= env(i / RATE, 0.003, 0.3);
  return out;
}

// tick (0.1 s): a short 3 kHz blip: sine with a 1 ms attack and a very fast decay (tau 8 ms).
function tick() {
  const out = buf(0.1);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    out[i] = Math.sin(TAU * 3000 * t) * env(t, 0.001, 0.008);
  }
  return out;
}

// chime (1.2 s): three notes C6 (1046.5 Hz), E6 (1318.5 Hz), G6 (1568 Hz), each starting 80 ms
// after the previous, each with a 3 ms attack and exponential decay (tau 0.25 s).
function chime() {
  const out = buf(1.2);
  [1046.5, 1318.5, 1568].forEach((f, k) => {
    const start = n(0.08 * k);
    for (let i = start; i < out.length; i++) {
      const t = (i - start) / RATE;
      out[i] += Math.sin(TAU * f * t) * env(t, 0.003, 0.25);
    }
  });
  return out;
}

const SOUNDS = [
  { id: "whoosh", label: "Whoosh", make: whoosh },
  { id: "swoosh", label: "Swoosh", make: swoosh },
  { id: "pop", label: "Pop", make: pop },
  { id: "click", label: "Click", make: click },
  { id: "ding", label: "Ding", make: ding },
  { id: "beep", label: "Beep", make: beep },
  { id: "riser", label: "Riser", make: riser },
  { id: "drop", label: "Drop", make: drop },
  { id: "tick", label: "Tick", make: tick },
  { id: "chime", label: "Chime", make: chime },
];

// Normalise to PEAK, apply the 5 ms end fades, quantise to 16-bit.
function finish(samples) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? PEAK / peak : 0;
  const fade = n(FADE_SEC);
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const f = Math.min(1, i / fade, (samples.length - 1 - i) / fade);
    pcm.writeInt16LE(Math.round(samples[i] * gain * f * 32767), i * 2);
  }
  return pcm;
}

// RIFF header written by hand: fmt chunk = PCM (1), mono, 44100 Hz, 16 bit; then the data chunk.
function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.argv[2] ?? join(root, "assets", "sfx"));
mkdirSync(outDir, { recursive: true });

const sounds = SOUNDS.map(({ id, label, make }) => {
  const pcm = finish(make());
  const file = `${id}.wav`;
  writeFileSync(join(outDir, file), wav(pcm));
  return { id, label, file, durationSec: Math.round((pcm.length / 2 / RATE) * 1000) / 1000 };
});
writeFileSync(join(outDir, "manifest.json"), JSON.stringify({ sounds }, null, 2) + "\n");
console.log(`Wrote ${sounds.length} sounds to ${outDir}`);
