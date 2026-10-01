This is an Expo/React Native mobile application. Prioritize mobile-first patterns and performance. This app targets iPhone only.

## This repo (Clipy)

- iPhone only. No Android or web configuration; do not add any.
- Daily testing is in Expo Go: run `npx expo start --go` (the `--go` flag is required because `expo-dev-client` is installed). Custom native code does not run in Expo Go; the app must degrade gracefully when `modules/clipy-video` is not linked.
- Native code lives only in `modules/clipy-video` (Swift, Expo Modules API). TypeScript never calls AVFoundation directly.
- Checks before declaring work done: `npm run typecheck` and `npm test`.
- Native code: `modules/clipy-video/ios` is compiled only on EAS; there is no Swift toolchain here — verify by reading against `node_modules/expo-modules-core/ios`.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run `npm run typecheck` and `npm test` before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode required. Install the CLI once with `npm install -g eas-cli`, then run it as `eas <command>`.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` does not exist, it is generated (Continuous Native Generation). Never create or edit it by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
