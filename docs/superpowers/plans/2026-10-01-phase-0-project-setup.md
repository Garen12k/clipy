# Clipy Phase 0 — Project Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Clipy Expo app that installs on the developer's iPhone (built in the cloud from Windows) and displays a string returned by a Swift native module.

**Architecture:** Expo (React Native, TypeScript) app using Expo Router. A local Expo Module written in Swift (`modules/clipy-video`) is the seed of the AVFoundation video engine; in this phase it exposes one `hello()` function. Jest (`jest-expo`) runs TypeScript tests on Windows with the native module mocked. EAS Build produces an iOS development build; `expo-dev-client` loads JS from the Windows dev server.

**Tech Stack:** Expo SDK (latest stable), Expo Router, Expo Modules API (Swift), expo-dev-client, EAS CLI, Jest + jest-expo, npm.

**Spec:** `docs/superpowers/specs/2026-10-01-clip-editor-app-design.md` (Section 3 Tech Stack, Section 7 Phase 0).

## Global Constraints

- iPhone only: no Android or web targets configured.
- Developer machine is Windows; iOS builds run only on EAS Build (cloud). Never assume Xcode is available locally.
- Package manager: npm.
- Native code lives only inside `modules/clipy-video`; TypeScript never calls AVFoundation directly.
- Steps marked **(USER)** need the human: they involve signing in to an Expo or Apple account or acting on the iPhone. The agent must not enter credentials; it stops and asks the user to do that step.
- Commit after every task with the attribution line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## File Structure

```
uncool/
├── app/
│   ├── _layout.tsx                      Expo Router root stack
│   └── index.tsx                        Home screen: shows hello() result
├── modules/clipy-video/
│   ├── expo-module.config.json          tells Expo autolinking this is an iOS module
│   ├── index.ts                         typed TS wrapper: hello()
│   ├── __tests__/index.test.ts          Jest test with native module mocked
│   └── ios/
│       ├── ClipyVideo.podspec           CocoaPods spec (built on EAS)
│       └── ClipyVideoModule.swift       Swift module: Name("ClipyVideo"), Function("hello")
├── app.json                             name Clipy, iOS bundle id, expo-router plugin, scheme
├── eas.json                             development / preview / production build profiles
├── package.json                         main: expo-router/entry, jest preset, scripts
├── tsconfig.json                        strict TS
├── README.md                            how to run on Windows + iPhone
└── docs/superpowers/...                 spec and plans (already present)
```

---

### Task 1: Create the Expo app in this repo

**Files:**
- Create: `package.json`, `app.json`, `tsconfig.json`, `babel.config.js` (if generated), `.gitignore`, `app/_layout.tsx`, `app/index.tsx`
- Delete: generated `App.tsx` (replaced by Expo Router)

**Interfaces:**
- Produces: a runnable Expo Router app; `npx tsc --noEmit` passes.

- [ ] **Step 1: Generate the project into a temp folder, then move it up**

The repo root already contains `docs/` and `.git/`, so generate into a subfolder and move the files up. Run from `C:\Users\User\Desktop\uncool` in PowerShell:

```powershell
npx create-expo-app@latest .tmp-clipy --template blank-typescript --no-install
Get-ChildItem -Force .tmp-clipy | Move-Item -Destination .
Remove-Item .tmp-clipy -Recurse -Force
npm install
```

Expected: `package.json`, `app.json`, `tsconfig.json`, `App.tsx`, `index.ts`, `.gitignore`, `assets/` now sit at the repo root. `node_modules/` is gitignored.

- [ ] **Step 2: Install Expo Router and its peer dependencies**

```powershell
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
```

- [ ] **Step 3: Point the entry at Expo Router**

In `package.json` replace the `"main"` value with:

```json
"main": "expo-router/entry",
```

Delete the generated `App.tsx` and `index.ts` (if present) at the repo root — Expo Router supplies the entry.

- [ ] **Step 4: Configure `app.json` for Clipy, iOS only**

Replace the contents of `app.json` with:

```json
{
  "expo": {
    "name": "Clipy",
    "slug": "clipy",
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "clipy",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#000000"
    },
    "ios": {
      "bundleIdentifier": "com.clipy.app",
      "supportsTablet": false,
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    "plugins": ["expo-router"]
  }
}
```

If the generated template's splash asset has a different filename, keep the generated filename. The bundle identifier can be changed later but must be set before the first EAS build.

- [ ] **Step 5: Create the router layout and home screen**

Create `app/_layout.tsx`:

```tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#000" },
        headerTintColor: "#fff",
        contentStyle: { backgroundColor: "#000" },
      }}
    />
  );
}
```

Create `app/index.tsx`:

```tsx
import { StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Clipy</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 32, fontWeight: "700" },
});
```

- [ ] **Step 6: Enable strict TypeScript and type-check**

Ensure `tsconfig.json` is:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

Run:

```powershell
npx tsc --noEmit
```

Expected: no output (exit code 0). If it complains about missing `expo-env.d.ts`, run `npx expo customize tsconfig.json` once, or start `npx expo start` briefly (it generates the file), then re-run.

- [ ] **Step 7: Smoke-run the dev server**

```powershell
npx expo start --web=false
```

Expected: Metro starts and prints a QR code without errors. Press `Ctrl+C` to stop. (You cannot see the screen yet without a device; that comes in Task 4.)

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "chore: scaffold Clipy Expo app with Expo Router

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Jest test setup with the native module wrapper (TDD)

**Files:**
- Create: `modules/clipy-video/index.ts`
- Create: `modules/clipy-video/__tests__/index.test.ts`
- Modify: `package.json` (jest preset + `test` script)

**Interfaces:**
- Produces: `hello(): string` exported from `modules/clipy-video/index.ts`. Task 3's Swift module must register under the name `"ClipyVideo"` with a function `hello`.

- [ ] **Step 1: Install Jest**

```powershell
npx expo install jest-expo jest @types/jest -- --save-dev
```

Open `package.json`; if `jest-expo`, `jest` or `@types/jest` landed under `dependencies`, move them to `devDependencies`. Then add:

```json
"scripts": {
  "start": "expo start",
  "test": "jest",
  "typecheck": "tsc --noEmit"
},
"jest": {
  "preset": "jest-expo"
}
```

(Keep any other generated scripts.)

- [ ] **Step 2: Write the failing test**

Create `modules/clipy-video/__tests__/index.test.ts`:

```ts
jest.mock("expo-modules-core", () => ({
  requireNativeModule: jest.fn((name: string) => {
    if (name !== "ClipyVideo") throw new Error(`unexpected module ${name}`);
    return { hello: () => "mock hello" };
  }),
}));

import { hello } from "../index";

describe("clipy-video wrapper", () => {
  it("hello() returns the native module's greeting", () => {
    expect(hello()).toBe("mock hello");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```powershell
npm test
```

Expected: FAIL with `Cannot find module '../index'`.

- [ ] **Step 4: Write the wrapper**

Create `modules/clipy-video/index.ts`:

```ts
import { requireNativeModule } from "expo-modules-core";

type ClipyVideoNative = {
  hello(): string;
};

const native = requireNativeModule<ClipyVideoNative>("ClipyVideo");

/** Returns a greeting from the Swift module. Phase 0 smoke test only. */
export function hello(): string {
  return native.hello();
}
```

- [ ] **Step 5: Run the test to verify it passes**

```powershell
npm test
```

Expected: `1 passed`.

- [ ] **Step 6: Type-check and commit**

```powershell
npm run typecheck
git add -A
git commit -m "test: add Jest with jest-expo and clipy-video wrapper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Swift native module and home screen wiring

**Files:**
- Create: `modules/clipy-video/expo-module.config.json`
- Create: `modules/clipy-video/ios/ClipyVideo.podspec`
- Create: `modules/clipy-video/ios/ClipyVideoModule.swift`
- Modify: `app/index.tsx`

**Interfaces:**
- Consumes: `hello()` from `modules/clipy-video/index.ts` (Task 2).
- Produces: native module registered as `"ClipyVideo"` exposing `hello() -> String`. Expo autolinking discovers any folder under `modules/` containing `expo-module.config.json`.

- [ ] **Step 1: Declare the module for autolinking**

Create `modules/clipy-video/expo-module.config.json`:

```json
{
  "platforms": ["apple"],
  "apple": {
    "modules": ["ClipyVideoModule"]
  }
}
```

- [ ] **Step 2: Create the podspec**

Create `modules/clipy-video/ios/ClipyVideo.podspec`:

```ruby
Pod::Spec.new do |s|
  s.name           = 'ClipyVideo'
  s.version        = '0.1.0'
  s.summary        = 'Clipy native video engine (AVFoundation)'
  s.description    = 'Swift Expo module that will wrap AVFoundation for preview, export and captions.'
  s.author         = 'Clipy'
  s.homepage       = 'https://github.com/clipy/clipy'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
```

- [ ] **Step 3: Write the Swift module**

Create `modules/clipy-video/ios/ClipyVideoModule.swift`:

```swift
import ExpoModulesCore
import AVFoundation

public class ClipyVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ClipyVideo")

    // Phase 0 smoke test: proves the Swift module is linked and callable.
    Function("hello") { () -> String in
      let version = ProcessInfo.processInfo.operatingSystemVersionString
      return "Hello from ClipyVideo (Swift, AVFoundation) on iOS \(version)"
    }
  }
}
```

- [ ] **Step 4: Show the greeting on the home screen**

Replace `app/index.tsx` with:

```tsx
import { StyleSheet, Text, View } from "react-native";
import { hello } from "../modules/clipy-video";

function nativeGreeting(): string {
  try {
    return hello();
  } catch (e) {
    return `Native module unavailable: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export default function HomeScreen() {
  const greeting = nativeGreeting();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Clipy</Text>
      <Text style={styles.greeting} testID="native-greeting">
        {greeting}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { color: "#fff", fontSize: 32, fontWeight: "700", marginBottom: 16 },
  greeting: { color: "#9f9", fontSize: 16, textAlign: "center" },
});
```

The `try/catch` means the screen still renders (with the error text) in Expo Go, where custom native modules cannot load.

- [ ] **Step 5: Verify autolinking sees the module**

```powershell
npx expo-modules-autolinking search --platform apple
```

Expected: the JSON output lists a module named `clipy-video` (or path `modules/clipy-video`). If it does not, confirm `expo-module.config.json` is spelled exactly and sits at `modules/clipy-video/`.

- [ ] **Step 6: Type-check, test, commit**

```powershell
npm run typecheck
npm test
git add -A
git commit -m "feat: add ClipyVideo Swift module with hello() and show it on home screen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Expected: typecheck clean, `1 passed`. The Swift file cannot be compiled on Windows; it is compiled in Task 4.

---

### Task 4: EAS development build on the iPhone

> **Amended 2026-10-01:** the user chose not to pay for an Apple Developer account yet. Steps 1 and 4 are done (commit `7d76ff9`). Steps 2–3 and 5–10 are **deferred** until an account exists; Phase 0 is instead verified in Expo Go (see Task 4b). Nothing below Step 4 is executed now.

**Files:**
- Create: `eas.json`
- Modify: `app.json` (EAS project id added by `eas init`)
- Modify: `package.json` (`expo-dev-client`)

**Interfaces:**
- Consumes: everything above. The build succeeds only if the podspec and Swift compile.
- Produces: an installable `.ipa` on the iPhone that loads JS from the Windows dev server.

- [ ] **Step 1: Install the dev client and EAS CLI**

```powershell
npx expo install expo-dev-client
npm install -g eas-cli
eas --version
```

Expected: a version number prints.

- [ ] **Step 2 (USER): Sign in to Expo**

The user needs a free account at https://expo.dev. Then, in their own terminal:

```powershell
eas login
```

The agent must not type credentials. Confirm with `eas whoami`.

- [ ] **Step 3: Link the project to EAS**

```powershell
eas init
```

Expected: `app.json` gains `"extra": { "eas": { "projectId": "<uuid>" } }` and `"owner"` may be added. Accept the defaults (create a new project named `clipy`).

- [ ] **Step 4: Write `eas.json`**

Create `eas.json`:

```json
{
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

If `eas --version` printed a version below 12, lower `cli.version` to match.

- [ ] **Step 5 (USER): Register the iPhone**

In the user's terminal:

```powershell
eas device:create
```

Choose **Website**; EAS prints a link/QR. The user opens it on the iPhone in Safari, installs the profile (Settings → Profile Downloaded → Install), which registers the device's UDID. This step signs in with the Apple Developer account — the user does it.

- [ ] **Step 6 (USER): Start the iOS development build**

In the user's terminal:

```powershell
eas build --profile development --platform ios
```

When prompted:
- "Do you want to log in to your Apple account?" → **Yes** (user enters credentials).
- Generate a new Apple Distribution Certificate → **Yes**.
- Generate a new Provisioning Profile → **Yes** (select the device registered in Step 5).

Expected: build is queued and finishes in roughly 10–25 minutes. The command prints a build page URL and, when done, a QR code / install link.

If the build **fails**, open the build page → "Run fastlane" / "Install pods" logs. The two likely causes are a podspec typo (Task 3 Step 2) or a Swift compile error (Task 3 Step 3). Fix, commit, and re-run this step.

- [ ] **Step 7 (USER): Install on the iPhone**

On the iPhone, open the install link (scan the QR with the Camera app). Tap **Install**. The Clipy icon appears on the home screen. Opening it shows the dev-client launcher screen.

- [ ] **Step 8: Start the dev server and connect**

On Windows, with the iPhone on the same Wi-Fi:

```powershell
npx expo start --dev-client
```

If the phone cannot reach the PC (firewall / different network), use:

```powershell
npx expo start --dev-client --tunnel
```

On the iPhone, in the Clipy launcher, scan the QR code (or tap the server listed under "Development servers").

- [ ] **Step 9 (USER): Verify the acceptance criterion**

Expected on the iPhone screen:

- Title **Clipy**
- Green text: `Hello from ClipyVideo (Swift, AVFoundation) on iOS Version 18.x (Build …)`

If instead the text starts with `Native module unavailable:`, the native module did not link. Check: `expo-module.config.json` present, `Name("ClipyVideo")` matches `requireNativeModule("ClipyVideo")`, and that the build was made **after** Task 3 was committed.

Edit the title in `app/index.tsx` (e.g. to `Clipy ✂️`) and save — the phone should hot-reload within a second or two. Revert the edit.

- [ ] **Step 10: Commit**

```powershell
git add -A
git commit -m "chore: configure EAS development builds for iOS

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4b: Verify in Expo Go (replaces the EAS acceptance check for now)

**Files:** none.

- [ ] **Step 1 (USER): Install Expo Go** from the App Store on the iPhone (free, no account needed).

- [ ] **Step 2: Start the dev server in Expo Go mode**

Because `expo-dev-client` is installed, `npx expo start` defaults to dev-client mode. Force Expo Go:

```powershell
npx expo start --go
```

Add `--tunnel` if the phone cannot reach the PC over Wi-Fi.

- [ ] **Step 3 (USER): Open the app** — scan the QR code with the iPhone Camera app; it opens in Expo Go.

- [ ] **Step 4 (USER): Verify** — the screen shows the title **Clipy** and, in green, `Native module unavailable: ClipyVideo native module is not linked. Use a development build (eas build --profile development), not Expo Go.` That text proves the TypeScript↔native boundary degrades gracefully, which is the Expo Go contract for all later phases. Edit the title in `app/index.tsx`, save, confirm hot reload, revert.

---

### Task 5: README with the run instructions

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: commands from Tasks 1–4.

- [ ] **Step 1: Write the README**

Create `README.md`:

```markdown
# Clipy

iPhone video clip editor with social publishing. Built with Expo (React Native + TypeScript)
and a Swift/AVFoundation native module. Developed on Windows; iOS builds run on EAS Build.

Design spec: `docs/superpowers/specs/2026-10-01-clip-editor-app-design.md`

## Prerequisites

- Node.js LTS and npm
- The free **Expo Go** app on your iPhone (App Store)

## Daily development (Expo Go, free)

```powershell
npm install
npx expo start --go
```

Scan the QR code with the iPhone Camera app; add `--tunnel` if the phone can't reach the PC.
In Expo Go the Swift video engine is not available: the app shows a "native module is not
linked" message where native features would run. All TypeScript features work.

## Running the real native engine (needs an Apple Developer account, $99/year)

One-time: `npm install -g eas-cli`, `eas login`, `eas init`, `eas device:create`.
Then build in the cloud and install from the link EAS prints:

```powershell
eas build --profile development --platform ios
```

Afterwards use `npx expo start --dev-client` instead of `--go`. Rebuild whenever anything
under `modules/clipy-video/ios/`, `app.json` plugins, or native dependencies change.

## Checks

```powershell
npm run typecheck
npm test
```

## Layout

- `app/` — screens (Expo Router)
- `modules/clipy-video/` — Swift native module (`ios/`) and its TypeScript wrapper (`index.ts`)
- `docs/superpowers/` — specs and implementation plans
```

- [ ] **Step 2: Commit**

```powershell
git add README.md
git commit -m "docs: add README with Windows + iPhone run instructions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Phase 0 Done When

- [ ] `npm run typecheck` and `npm test` pass on Windows.
- [ ] The app opens in Expo Go on the iPhone and shows the "not linked" fallback text.
- [ ] Saving a TS file hot-reloads on the phone.
- [ ] (Deferred until an Apple Developer account exists) EAS development build installs and the home screen shows the Swift `hello()` greeting.
