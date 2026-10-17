# Clipy — handover to a new computer (written 17 October 2026)

Read this whole file before doing anything. Then read `AGENTS.md` (the binding rulebook of the repo).

## Who you are working for

- The owner is **not a developer**. They test on a real iPhone. They want **short, plain replies**, one-line commands, and want you to **do the work for them**.
- How they like to work: you **draw** a design first (a visual mockup), they tap "Build it like this", then you write a spec + plan, build it with tests and an independent review, they test on the phone, and say "its working now, merge it".
- When they say **"keep going"** they want the next improvement. Pick one, draw it, and wait for their tap.
- Use they/them for the owner.

## Safety rules that always apply

- Never type or paste passwords, API keys or secrets. For a secret, the owner copies it to the clipboard and you store it with a command (e.g. `supabase secrets set`) without ever printing it.
- Never create accounts or sign in for the owner. They sign in, register and accept terms themselves.
- Apple Developer account: **"do everything but don't delete anything"** — never revoke or delete certificates, profiles, devices, identifiers or apps.
- Never tell the owner to delete the Clipy app from the phone (their projects would be lost).
- Ask before pushing, merging to `main`, deploying or building.

## The project

- Clipy: an Expo SDK 57 / React Native 0.86 **iPhone-only** video editor. GitHub: `Garen12k/clipy`.
- Bundle id `com.astinos.clipy`, Apple team `H7WG867R7K`, App Store Connect app "Clipy Video Editor" (id 6821282940).
- Expo account: `astinos`. EAS project is set up; credentials (signing) are stored on EAS.
- Server: Supabase project `axbviqlregoldaijnsha` (Edge Functions in `supabase/functions`). Public site: https://garen12k.github.io/clipy/ (the `gh-pages` branch — edit that branch, never make a second site).
- Native code: only `modules/clipy-video` (Swift).
- Checks before saying anything is done: `npm run typecheck` and `npm test`.

## Branches

- `main` = what is on the phone now (TestFlight build 8).
- **`next-build`** = main + **16 finished features nobody has seen on a phone yet**. This is the branch to build next. New work branches from `next-build` and is merged back into it (not into `main`). Merge to `main` only after the owner has tested the build and says so.
- `ipad` = iPad layout, **on hold** (owner said so). Do not touch.

What `next-build` holds (in the order of risk; the owner's one test list is `docs/next-build-phone-checklist.md`):
1. Safe saving (a real data-loss bug on build 8: leaving the editor right after an edit could delete `project.json`; until the new build the owner waits ~3 s after the last edit before leaving the editor).
2. Project backup (`.clipy` files: Save a Copy / Open Project File) and the path fix.
3. Undo history kept when a project is reopened.
4. Text size limits (Dynamic Type).
5. Export presets (Social / Message / Best).
6. Voice-over 3-2-1 countdown and level meter.
7. Text reveal animations (Typewriter / Word by word) — adds Swift, never compiled yet.
8. Open Instagram button on Export, and Save to Photos through a newer call (check it first).
9. Apple sign-in token revocation on account deletion (server code NOT deployed yet).
10. Copy / Paste text style.
11. New Project / Quick Edit picker hardening.
12. Smoother playback (texts don't redraw every frame).
13. Save As Style (own Quick Edit styles).
14. Remove pauses.
15. Captions follow cuts + Remove filler words.
16. Home search, sort and pin.

## Building — why it is stuck and how a Mac fixes it

- EAS's free cloud builds for iOS are **used up until 1 November 2026**. Building on a Mac with `--local` does not use that quota.
- One-time Mac setup (the owner does the installs): Xcode 26 from the App Store (opened once, terms accepted; needs macOS 15.6+), Node.js LTS, then `brew install cocoapods fastlane` (Homebrew from brew.sh).
- Get the code: `git clone https://github.com/Garen12k/clipy.git && cd clipy && git checkout next-build && npm install`.
- `.env` is not in git. Make it from `.env.example`: the two values (Supabase URL `https://axbviqlregoldaijnsha.supabase.co` and the publishable key) are in the Supabase dashboard → Settings → API. The owner copies the key; it is a public key but still never commit `.env`.
- The owner signs in: `npx eas-cli login` (account `astinos`).
- Before any build check the entitlements: `npx expo config --type introspect` → `ios.entitlements` must be **Sign in with Apple only** (no `aps-environment`).
- Build: `EXPO_NO_CAPABILITY_SYNC=1 npx eas-cli build --platform ios --profile production --local` (always with `EXPO_NO_CAPABILITY_SYNC=1`). It makes an `.ipa` file.
- Send to TestFlight: `npx eas-cli submit --platform ios --path <the .ipa>` (or Apple's Transporter app).
- The build number is kept on EAS (`appVersionSource: remote`), last bumped to 10.
- On build day ALSO deploy the server from `next-build`: the owner runs `npx supabase login`, then `npx supabase link --project-ref axbviqlregoldaijnsha`, then `npx supabase functions deploy`.
- Batch changes: never spend a build on a one-line change.

## Posting status

- YouTube: works (uploads private until Google's API audit). TikTok: drafts + Post now work (private until TikTok's audit; server secret `TIKTOK_DIRECT_POST=true`). X: works (paid per post). Facebook and Instagram rows are hidden (no Facebook account); Instagram is reached by "Open Instagram" on Export.

## Waiting on the owner or on Apple

- **Sign in with Apple fails** with "Sign Up Not Completed" — Apple's server-side fault (works in other apps). The owner should contact Apple Developer Support (team H7WG867R7K, bundle com.astinos.clipy). Do not toggle the capability or recreate the App ID.
- Apple revocation key (`APPLE_REVOKE_KEY` + `APPLE_KEY_ID` secrets) not set — `supabase/README.md` §14.
- App Store submission is the owner's last step: draft in `docs/app-store/listing-draft.md`.
- iPad: on hold.

## Where things are written down

- `AGENTS.md` — every rule of the code (long; read it).
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — the design and plan of every feature.
- `docs/next-build-phone-checklist.md` — the owner's test list for the next build.
- `supabase/README.md` — the server, secrets and platform setup.
