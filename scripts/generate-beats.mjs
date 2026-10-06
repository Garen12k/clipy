// Generates assets/music/beats.json: the beats of every bundled music track, found once at development time.
// The app cannot read a music file's samples in Expo Go, so the bundled tracks ship with their beats already marked.
//
// Usage (PowerShell; the decoder is installed OUTSIDE the repo, package.json is not touched):
//   npm.cmd install --prefix "$env:TEMP\clipy-beats" mpg123-decoder@1.0.3
//   node --experimental-strip-types scripts/generate-beats.mjs "$env:TEMP\clipy-beats"
// A second argument writes somewhere else than assets/music/beats.json.
//
// The detector itself is src/editor/model/beatDetect.ts (tested by Jest); this script only decodes, calls it, checks the answer and
// writes the file. Deterministic: the same mp3 files give a byte-identical beats.json. Re-run it rather than editing the file.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { detectBeats } from "../src/editor/model/beatDetect.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MUSIC = join(ROOT, "assets", "music");
/** A track's beats are only shipped when all three hold. */
const ACCEPT = { minConfidence: 1.5, halvesWithin: 0.005, countWithin: 1.5, durationWithin: 0.3 };

const decoderDir = process.argv[2];
const outFile = resolve(process.argv[3] ?? join(MUSIC, "beats.json"));
const entry = decoderDir ? join(resolve(decoderDir), "node_modules", "mpg123-decoder", "index.js") : "";
if (!decoderDir || !existsSync(entry)) {
  console.error("Decoder not found. Run first:\n  npm.cmd install --prefix \"$env:TEMP\\clipy-beats\" mpg123-decoder@1.0.3\nthen pass that folder as the first argument.");
  process.exit(1);
}
const { MPEGDecoder } = await import(pathToFileURL(entry).href);

/** The whole file as one mono signal. */
async function decodeMono(file) {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  const { channelData, sampleRate, samplesDecoded } = decoder.decode(new Uint8Array(readFileSync(file)));
  decoder.free();
  const mono = new Float32Array(samplesDecoded);
  for (const ch of channelData) for (let i = 0; i < samplesDecoded; i++) mono[i] += ch[i] / channelData.length;
  return { mono, sampleRate };
}

const manifest = JSON.parse(readFileSync(join(MUSIC, "manifest.json"), "utf8"));
const tracks = {};
let failed = false;
for (const t of manifest.tracks) {
  const { mono, sampleRate } = await decodeMono(join(MUSIC, t.file));
  const seconds = mono.length / sampleRate;
  if (Math.abs(seconds - t.durationSec) > ACCEPT.durationWithin) {
    console.error(`${t.id}: decoded ${seconds.toFixed(2)} s but the manifest says ${t.durationSec} s — fix the manifest or the file.`);
    failed = true;
    continue;
  }
  const whole = detectBeats(mono, sampleRate);
  const half = Math.floor(mono.length / 2);
  const a = detectBeats(mono.subarray(0, half), sampleRate), b = detectBeats(mono.subarray(half), sampleRate);
  const steady = whole && a && b && Math.abs(a.bpm - whole.bpm) <= whole.bpm * ACCEPT.halvesWithin && Math.abs(b.bpm - whole.bpm) <= whole.bpm * ACCEPT.halvesWithin;
  const counted = whole && Math.abs(whole.beats.length - ((seconds - whole.first) * whole.bpm) / 60) <= ACCEPT.countWithin;
  const ok = !!whole && whole.confidence >= ACCEPT.minConfidence && !!steady && !!counted;
  tracks[t.id] = ok ? { bpm: whole.bpm, first: whole.first, confidence: whole.confidence, beats: whole.beats } : null;
  console.log(`${t.id.padEnd(20)} ${seconds.toFixed(2).padStart(6)} s  ${ok ? "OK  " : "NONE"}  bpm ${String(whole?.bpm ?? "-").padStart(7)}  halves ${a?.bpm ?? "-"} / ${b?.bpm ?? "-"}  first ${whole?.first ?? "-"}  beats ${whole?.beats.length ?? 0}  confidence ${whole?.confidence ?? "-"}`);
}
if (failed) process.exit(1);

// One track per line, so a re-run shows as one changed line per changed track.
const lines = Object.entries(tracks).map(([id, v]) => `    ${JSON.stringify(id)}: ${JSON.stringify(v)}`);
writeFileSync(outFile, `{\n  "version": 1,\n  "tracks": {\n${lines.join(",\n")}\n  }\n}\n`);
console.log(`Wrote ${outFile}: ${Object.values(tracks).filter(Boolean).length} of ${manifest.tracks.length} tracks have a steady beat.`);
