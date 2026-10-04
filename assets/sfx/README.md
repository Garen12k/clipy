# Bundled sound effects

Ten short sound effects (whoosh, swoosh, pop, click, ding, beep, riser, drop, tick, chime).

They are not recordings: `scripts/generate-sfx.mjs` synthesizes them from scratch (sine sweeps and
softened noise), so there is no licensed material. They are free to use, with no attribution needed.

- Regenerate: `node scripts/generate-sfx.mjs` (optionally pass an output folder). Output is
  deterministic, so the committed files are byte-identical to a fresh run (a test checks this).
- Format: mono, 44.1 kHz, 16-bit PCM WAV, each at most 1.6 s, peak about 0.6 of full scale.
- `manifest.json` lists `{ id, label, file, durationSec }`; `src/editor/sfx.ts` holds the static
  `require` for each file. To add a sound, add a recipe to the script, regenerate, and add the id
  and `require` in `sfx.ts`.
