# Bundled music

This folder ships royalty-free background tracks with the app. It currently has **no tracks** —
the manifest below is empty on purpose (the user chose not to bundle any yet).

## Adding a track

1. Drop a CC0-licensed `.mp3` file in this folder, e.g. `assets/music/chill-loop.mp3`.
   CC0 ("no rights reserved") means no attribution is required, so the app can ship it without
   a credits screen. Good sources: https://freepd.com, https://freesound.org (filter by CC0).
2. Add an entry to `manifest.json`:
   ```json
   { "id": "chill-loop", "title": "Chill Loop", "file": "chill-loop.mp3", "durationSec": 123.4, "license": "CC0", "source": "https://freepd.com/..." }
   ```
   - `id` must be unique and stable (used to match the track across app versions).
   - `durationSec` should be measured precisely (e.g. with `ffprobe` or `npx -y music-metadata-cli <file>`), rounded to 1 decimal.
   - `source` must be the page the file was downloaded from, for attribution/audit purposes.
3. Add a matching `require()` line to the `FILES` map in `src/editor/music.ts`:
   ```ts
   const FILES: Record<string, number> = {
     "chill-loop.mp3": require("../../assets/music/chill-loop.mp3"),
   };
   ```
4. Run `npm test -- music.test` — it verifies every manifest track is CC0, has a valid `source`
   URL, a `durationSec > 5`, a file that exists on disk, and a matching `FILES` entry.

Keep the total size of this folder modest (a handful of short loops, not a full music library).
