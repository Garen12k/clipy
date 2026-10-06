# Bundled music

This folder ships royalty-free background tracks with the app. Every track is CC0 (public domain dedication): no credit is
required, so the app ships them without a credits screen. Credits are kept here as a record of where each file came from.

## Tracks

Downloaded 2026-10-05 from OpenGameArt; each page listed CC0 as the track's only licence on that date.

| File | Title on the source page | Creator | Length | Source page |
|---|---|---|---|---|
| `party-sector.mp3` | Party Sector | Joth | 96.1 s | https://opengameart.org/content/party-sector |
| `funked-up.mp3` | Funked Up | Joth | 66.3 s | https://opengameart.org/content/funked-up |
| `happy-adventure.mp3` | Happy Adventure | TinyWorlds | 46.8 s | https://opengameart.org/content/happy-adventure-loop |
| `bossa-nova.mp3` | Bossa Nova | Joth | 59.6 s | https://opengameart.org/content/bossa-nova |
| `frigid-seas.mp3` | The Frigid Seas | Joth | 69.9 s | https://opengameart.org/content/the-frigid-seas |
| `jrpg2-piano.mp3` | JRPG2 Piano | Joth | 32.1 s | https://opengameart.org/content/jrpg2-piano |
| `field-of-dreams.mp3` | The Field of Dreams | pauliuw | 84.6 s | https://opengameart.org/content/the-field-of-dreams |
| `mandatory-overtime.mp3` | Mandatory Overtime | Joth | 40.9 s | https://opengameart.org/content/mandatory-overtime |

The `title` and `durationSec` of a shipped track in `manifest.json` are how music already in projects is recognised as built-in
(a track stores no song id): do not change them.

## Adding a track

1. Drop a CC0-licensed `.mp3` file in this folder, e.g. `assets/music/chill-loop.mp3`.
   CC0 ("no rights reserved") means no attribution is required, so the app can ship it without
   a credits screen. Good source: https://opengameart.org (filter music by licence CC0; check the licence on the track's own page). FreePD has closed.
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
5. Generate the track's beats (see **Beats** below) and commit the changed `beats.json`. A new track needs both: its
   `manifest.json` row AND a re-run of the script. `npm test -- musicBeats` checks that every manifest track has an entry,
   in the manifest's order.

## Beats (`beats.json`)

`beats.json` holds the beats of every track above, for **Find beats** in the editor and for **Quick edit**. It is a GENERATED
file: `scripts/generate-beats.mjs` decodes each mp3 and runs the detector in `src/editor/model/beatDetect.ts` on it. **Re-run
the script rather than editing the file.** The same mp3 files give a byte-identical file.

The mp3 decoder is installed OUTSIDE the repo (it is never added to `package.json`). In PowerShell, from the repo root, with
Node 22 (22.14 was used; the script loads a TypeScript file with Node's type stripping):

```powershell
npm.cmd install --prefix "$env:TEMP\clipy-beats" mpg123-decoder@1.0.3
node --experimental-strip-types scripts/generate-beats.mjs "$env:TEMP\clipy-beats"
```

The script prints one line per track and writes one entry per manifest track, one track per line. It fails when a file's decoded
length is more than 0.3 s from the manifest's `durationSec` (fix the manifest or the file). A track it reports as `NONE` has no
steady beat (confidence under 1.5, or the two halves of the track disagree on the tempo by more than 0.1 %): its entry is `null`,
it ships without beats, and Find beats says so. Today that is one of the eight: The Frigid Seas.

Keep the total size of this folder modest (a handful of short loops, not a full music library).
