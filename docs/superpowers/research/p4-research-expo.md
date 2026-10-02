# Phase 4 phone-side research (Expo SDK 57, iPhone, Expo Go) - 2026-10-02

Notation: [NM] = file under C:\Users\User\Desktop\uncool\node_modules ; [DOC] = docs.expo.dev v57 page (fetched; summaries by the fetch tool, so exact type text was cross-checked in node_modules or raw GitHub sdk-57 branch where noted).
Installed versions come from package.json: expo ~57.0.26, expo-file-system ~57.0.7 (confirmed [NM]/expo-file-system/package.json), react-native 0.86.3, jest-expo ~57.0.5.

## 1. expo-file-system (SDK 57)

- Current API: `import { File, Directory, Paths, FileMode } from "expo-file-system"`. [NM]/expo-file-system/build/index.d.ts exports Paths, File, Directory, UploadTask, DownloadTask, FileMode, EncodingType, UploadType.
- `new File(...uris: (string|File|Directory)[])`, e.g. `new File(videoUri)` or `new File(Paths.cache, "a.mp4")`. [NM]/build/File.d.ts. `Paths.cache`, `Paths.document`, `Paths.bundle`, `Paths.availableDiskSpace`. [DOC https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/]
- Size: `file.size` (number of bytes, 0 if missing/unreadable). [DOC filesystem]. `file.info()` also exists. FileHandle also has `.size`.
- Byte-range read WITHOUT loading whole file (FileHandle): [NM]/build/File.types.d.ts lines ~80-85:
  ```ts
  class FileHandle { close(): void; readBytes(length: number): Uint8Array<ArrayBuffer>; writeBytes(bytes: Uint8Array): void; offset: number|null; size: number|null }
  ```
  `file.open(mode?: FileMode)` returns FileHandle; default ReadOnly for content://, ReadWrite for file:// ([DOC]); pass `FileMode.ReadOnly` explicitly ("r"; enum has ReadWrite "rw", ReadOnly, WriteOnly, Append "wa", Truncate "wt"). Minimal:
  ```ts
  const f = new File(uri); const total = f.size;
  const h = f.open(FileMode.ReadOnly);
  try { h.offset = start; const chunk = h.readBytes(Math.min(CHUNK, total - start)); /* Uint8Array */ } finally { h.close(); }
  ```
  `readBytes` and `offset` are SYNCHRONOUS (no Promise) per the typings. Not shown in the typings: whether `open` is declared on the native base class (typing for `open` not in File.d.ts; docs list it - verify with tsc when coding).
- Whole-file readers: `file.bytes()` (Promise<Uint8Array>), `bytesSync()`, `base64()`, `base64Sync()`, `text()`, `arrayBuffer()`. [DOC] + [NM]/build/File.d.ts. Streams: `readableStream()`, `writableStream()`, `stream()`. [NM]/build/File.d.ts
- `file.slice(start,end,contentType)` returns a Blob but is IMPLEMENTED as `new Blob([this.bytesSync().slice(start, end)])` - it reads the WHOLE file into memory first. [NM]/expo-file-system/src/File.ts line 205-207. Do NOT use for large video.
- Legacy API still present at `expo-file-system/legacy` ([NM]/expo-file-system/legacy.ts -> src/legacy; [DOC] "Legacy API"): `readAsStringAsync(uri, { encoding: "base64", position, length })` ([NM]/src/legacy/FileSystem.types.ts ReadingOptions lines 250-263: position = bytes to skip, only used when length defined; length = bytes to read), `uploadAsync(url, fileUri, { httpMethod, headers, uploadType: FileSystemUploadType.BINARY_CONTENT|MULTIPART, sessionType })`, `createUploadTask(url, fileUri, options, (p)=>p.totalBytesSent/…)` with progress callback (src/legacy/FileSystem.ts line 334). NOTE: importing legacy names from bare `"expo-file-system"` throws at runtime with a console warning ([NM]/src/legacyWarnings.ts); must import from `expo-file-system/legacy`.
- New-API upload with progress: `file.upload(url, options?)` / `file.createUploadTask(url, { uploadType: UploadType.BINARY_CONTENT|MULTIPART, onProgress: ({bytesSent,totalBytes}) => ..., signal? })` returns `UploadResult {body,status,headers}`; resolves for any HTTP status. [NM]/build/File.d.ts, NetworkTasks.types.d.ts. Uploads whole file, native-streamed (not in JS memory); can't set a byte range, but headers/method options exist (see UploadOptions in NetworkTasks.types.d.ts, verify it has headers/httpMethod before relying).
- Recommendation for ~5-10 MB chunks: (a) FileHandle `readBytes(CHUNK)` per chunk then `fetch(url,{method:"PUT",headers:{"Content-Range":...},body: bytes})`; only one chunk (5-10 MB) is held in JS memory at a time, base64 not needed (base64 via legacy readAsStringAsync inflates by 33% and needs atob/decoding). (b) If the server accepts one streamed resumable PUT of the whole file, `file.upload`/legacy `createUploadTask` gives real byte progress with native streaming and background session (legacy sessionType BACKGROUND default on iOS) and zero JS memory. Keep chunk sizes aligned to server requirement (e.g. multiples of 256 KiB for Google-style resumable).

## 2. fetch with binary bodies (SDK 57)

- Global `fetch` IS `expo/fetch` on iOS by default (opt-out env EXPO_PUBLIC_USE_RN_FETCH=1). [NM]/expo/src/winter/runtime.native.ts lines 41-53; [DOC https://docs.expo.dev/versions/v57.0.0/sdk/expo/] says same.
- Body types accepted ([NM]/expo/src/winter/fetch/RequestUtils.ts normalizeBodyInitAsync): string, ArrayBuffer, any ArrayBuffer view (Uint8Array respected with byteOffset/length), Blob, URLSearchParams, ReadableStream (fully read into memory first), FormData. So `body: uint8` works for PUT/POST; custom headers such as `Content-Range` are normal headers.
- Blob/File as body: accepted, but converted to a full ArrayBuffer (`blobToArrayBufferAsync`) and Content-Type is OVERRIDDEN with `blob.type` (RequestUtils.ts line 71-75). `File` implements Blob ([NM]/build/File.d.ts line 18 `implements Blob`), but because `slice()` reads the entire file (see 1), passing `file.slice()` is not memory-safe. Use Uint8Array from FileHandle instead; set Content-Type yourself. (Check: with a Uint8Array body no Content-Type override occurs.)
- Upload progress: none in fetch (no upload event; response streaming only, `resp.body.getReader()`) [DOC expo page]. Per-chunk progress = bytes confirmed so far / total is the right granularity; finer progress needs `file.createUploadTask(...onProgress)` or legacy createUploadTask.
- AbortController: supported; `init.signal` is read, aborted-before-start throws FetchError, abort listener cancels native request. [NM]/expo/src/winter/fetch/fetch.ts lines 44-83.

## 3. expo-web-browser / expo-linking

(expo-web-browser is NOT in node_modules; sources from raw GitHub branch sdk-57.)
- Signature: `openAuthSessionAsync(url: string, redirectUrl?: string|null, options: AuthSessionOpenOptions = {}): Promise<WebBrowserAuthSessionResult>`. [https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-web-browser/src/WebBrowser.ts]
- Result: `WebBrowserRedirectResult {type:"success", url:string}` | `WebBrowserResult {type: "cancel"|"dismiss"|"opened"|"locked"}` (success has `url`; cancel when user closes sheet). [.../WebBrowser.types.ts]
- Options (iOS): `preferEphemeralSession?: boolean` (default false; true = no shared cookies/private session, so the user has to log in every time but no consent popup carry-over), `preferUniversalLinks?: boolean` (new; https universal-link callbacks, needs Associated Domains), plus inherited iOS open options (controlsColor, dismissButtonStyle, readerMode, presentationStyle).
- iOS uses ASWebAuthenticationSession; it returns when the page navigates to a URL matching the redirectUrl's scheme. [DOC https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser/]. The `exp://` Expo Go case is not described in the sources I fetched; the scheme "exp" is what the session waits for, which should work in Expo Go (untested here - confirm on device).
- `Linking.createURL(path, { scheme, queryParams, isTripleSlashed })`; [NM]/expo-linking/src/createURL.ts lines 56-72: Expo Go dev => `exp://<hostUri>/--/path` (e.g. `exp://192.168.1.5:8081/--/oauth`); dev/production build => `<scheme>://path` using app.json `scheme` (here "clipy" -> `clipy://oauth`). Behaviour for published updates in Expo Go undefined.
- Parsing result: `const { queryParams, path } = Linking.parse(result.url)` (`parse` exported from expo-linking; [NM]/expo-linking/build/Linking.d.ts line 84), or `new URL(result.url).searchParams`. Note: on iOS the return URL fragment (#) vs query matters; `Linking.parse` handles query only.
- An OAuth server redirecting to `exp://…` in Expo Go must be allow-listed server-side; for builds, `clipy://oauth` - so the redirect URL has to come from createURL and be registered per environment.

## 4. expo-apple-authentication

Not in node_modules; bundledNativeModules.json lists `"expo-apple-authentication": "~57.0.2"` ([NM]/expo/bundledNativeModules.json) which is the Expo Go-bundled version set.
- Expo Go: [DOC https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/] "Development testing works in Expo Go on iOS, though identifiers may differ from production" (user id is Expo Go's, not your bundle id, so the identity token `aud` will be host.exp.Exponent, not com.clipy.app; backend must accept it for dev).
- `isAvailableAsync(): Promise<boolean>`; `signInAsync(options?: { requestedScopes?: AppleAuthenticationScope[]; state?: string; nonce?: string }): Promise<AppleAuthenticationCredential>` [raw sdk-57 AppleAuthentication.ts / .types.ts].
- Scopes enum: `AppleAuthenticationScope.FULL_NAME` (0), `.EMAIL` (1).
- Credential: `{ user, state, fullName, email, realUserStatus, identityToken (JWT string|null), authorizationCode }`. Name/email only on first-ever authorization; store them.
- `nonce`: "arbitrary string used to prevent replay"; Apple embeds the SHA-256 of it in the token's `nonce` claim in practice (iOS lib passes the string to ASAuthorizationAppleIDRequest.nonce; docs do not say it hashes it - verify on device which form lands in the JWT). Typical pattern: generate raw nonce, send SHA-256 hex as `nonce`, server compares against token claim.
- Button: `<AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthenticationButtonType.SIGN_IN|CONTINUE|SIGN_UP} buttonStyle={AppleAuthenticationButtonStyle.WHITE|WHITE_OUTLINE|BLACK} cornerRadius={n} style={{width,height}} onPress={...}/>`.
- Config: app.json `"ios": { "usesAppleSignIn": true }` (only needed for real builds; Expo Go ignores the app.json and uses its own entitlement, so adding it does not affect Expo Go). Current app.json has no such key and no `expo-apple-authentication` plugin; adding the package to plugins is not required (plugin only sets the entitlement; usesAppleSignIn does the same). [DOC]

## 5. expo-secure-store / expo-crypto

- secure-store NOT installed; bundled version `~57.0.4` [NM]/expo/bundledNativeModules.json. Expo Go supported [DOC https://docs.expo.dev/versions/v57.0.0/sdk/securestore/].
- API [raw sdk-57 SecureStore.ts]: `setItemAsync(key, value, options?)`, `getItemAsync(key, options?): Promise<string|null>`, `deleteItemAsync(key, options?)`, sync `setItem/getItem`, `isAvailableAsync()`, `canUseBiometricAuthentication()`. Options: keychainService, requireAuthentication, authenticationPrompt, keychainAccessible (default WHEN_UNLOCKED), accessGroup. Keys: non-empty, only alphanumerics, ".", "-", "_".
- Size: docs say large payloads "can be rejected"; historically ~2048 bytes on some iOS versions; no hard figure in source. Keep to short tokens (refresh token, user id), not long JWT bundles.
- Under Expo Go, `requireAuthentication: true` is not supported when biometrics are available (no NSFaceIDUsageDescription).
- expo-crypto IS installed (~57.0.3). [NM]/expo-crypto/build/Crypto.d.ts: `getRandomBytes(n): Uint8Array`, `getRandomBytesAsync`, `randomUUID(): string`, `digestStringAsync(algorithm: CryptoDigestAlgorithm, data: string, options?: { encoding?: CryptoEncoding }): Promise<string>` (default encoding HEX). SHA-256: `await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw)`. Nonce: `Crypto.randomUUID()` or hex of getRandomBytes(16).

## 6. expo-image-picker (installed ~57.0.20) and thumbnails

- `ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], ... })`. [NM]/expo-image-picker/build/ImagePicker.types.d.ts line 48: `MediaType = 'images'|'videos'|'livePhotos'` (array or single; old `MediaTypeOptions` enum is deprecated, default is 'images').
- `videoExportPreset?: VideoExportPreset` default `Passthrough` (no recompression, resolution unchanged); marked @deprecated in the typings (still used). `preferredAssetRepresentationMode`: `UIImagePickerPreferredAssetRepresentationMode.Automatic|Compatible|Current` ; `Current` = avoid transcoding. TS doc says default Automatic but the Swift default is `.current` ([NM]/expo-image-picker/ios/ImagePickerOptions.swift line 44) - set it explicitly to `Current`. `shouldDownloadFromNetwork` (iOS, default false): for Passthrough, controls iCloud download; if the video lives only in iCloud and false, pick may fail/return unavailable.
- Asset fields (`ImagePickerAsset`, types lines 265-305): `uri` (file:// copy in cache), `width`, `height`, `fileName`, `fileSize` (bytes), `mimeType`, `duration` = MILLISECONDS (types: "Length of the video in milliseconds"; iOS code `* 1000`, VideoUtils.swift line 24), `type`.
- Avoid slow copy/transcode: use mediaTypes ["videos"], `videoExportPreset: Passthrough`, `preferredAssetRepresentationMode: Current`, `allowsEditing: false`, no `videoMaxDuration` (trimming UI forces export). The picker still copies the file into the app cache; that cost is unavoidable (no in-place reference), but no re-encode.
- Existing thumbnails: `src/editor/components/thumbnails.ts` (not src/editor/thumbnails.ts) uses `expo-video-thumbnails` `getThumbnailAsync(uri, { time (ms), quality })` and returns `.uri`; already installed (~57.0.2). Reuse `getThumb(uri, timeSec)`.
- app.json already has the expo-image-picker plugin with photosPermission.

## 7. Package inventory

package.json already has: expo-file-system ~57.0.7, expo-crypto ~57.0.3, expo-image-picker ~57.0.20, expo-linking ~57.0.11, expo-video-thumbnails ~57.0.2, expo-constants.
Need `npx expo install`: expo-web-browser (~57.0.3), expo-apple-authentication (~57.0.2), expo-secure-store (~57.0.4) (versions from [NM]/expo/bundledNativeModules.json). All three are in that list, i.e. SDK-57 bundled set; Expo Go supports each (docs for apple-auth and secure-store say so explicitly; WebBrowser doc lists Expo Go). Note the project has expo-dev-client, so run with `npx expo start --go`.
No new `app.json` plugin required for Expo Go; for EAS builds add `"usesAppleSignIn": true` under ios, and optionally plugins "expo-secure-store", "expo-web-browser" (no config needed).

## 8. Jest (jest-expo ~57.0.5)

- jest-expo setup ([NM]/jest-expo/src/preset/setup.js lines 130-143): auto-mocks `expo-file-system/legacy` as jest.fn stubs ONLY for: downloadAsync, getInfoAsync, readAsStringAsync (resolves undefined), writeAsStringAsync, deleteAsync, moveAsync, copyAsync, makeDirectoryAsync, readDirectoryAsync, createDownloadResumable. `uploadAsync`/`createUploadTask` are NOT in the list - mock them yourself.
- Native modules with a `mocks/` folder in the package are auto-registered via requireOptionalNativeModule (setup.js ~245-285): expo-crypto has mocks/ExpoCrypto.ts - but digestString returns '' and randomUUID returns undefined, so mock `expo-crypto` yourself for deterministic nonce/digest. expo-file-system has mocks/ExponentFileSystem.ts + FileSystem.ts for legacy only; the new `File` class is class-based native: use `jest.mock("expo-file-system", () => ({ File: class { size=...; open(){...} }, FileMode: {ReadOnly:"r"}, Paths: {...} }))`.
- jest-expo moduleMocks/expoModules.js includes a stub list for ExpoAppleAuthentication (isAvailableAsync, requestAsync, etc., as no-op jest.fn async); expo-secure-store/web-browser are not guaranteed; mock explicitly:
  `jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))`, `jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }))`, `jest.mock("expo-apple-authentication", () => ({ isAvailableAsync: jest.fn(), signInAsync: jest.fn(), AppleAuthenticationScope:{FULL_NAME:0,EMAIL:1}, AppleAuthenticationButton: View }))`.
- Repo jest.setup.ts already mocks expo-font, expo-audio, expo-document-picker, expo-asset, etc.; `expo-linking` has mocks/ExpoLinking.ts (createURL is JS and uses Constants, so output in jest is scheme-based or exp://; mock `expo-linking` createURL/parse for stability). expo-image-picker has no mocks/ folder: `jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), UIImagePickerPreferredAssetRepresentationMode:{Current:"current"}, VideoExportPreset:{Passthrough:0} }))`. `expo-video-thumbnails` is already mocked in repo tests.
- global `fetch`: stub with `global.fetch = jest.fn()` in tests.

## Surprises

1. `File.slice()` in expo-file-system 57 reads the entire file into memory (bytesSync().slice) - unusable for big videos; use FileHandle.open/offset/readBytes (synchronous).
2. fetch with a Blob/File body buffers the whole blob and overrides Content-Type with blob.type; Uint8Array bodies are fine; fetch has no upload progress.
3. Legacy functions imported from bare "expo-file-system" throw at runtime; you must import `expo-file-system/legacy` (uploadAsync/createUploadTask/readAsStringAsync{position,length} still exist there).
4. image-picker `duration` is milliseconds; the native default for preferredAssetRepresentationMode is `current` although the TS doc says Automatic; videoExportPreset is marked deprecated yet is the way to keep Passthrough.
5. Apple Sign-In in Expo Go works but the token audience is Expo Go's bundle id, not com.clipy.app; backend needs a dev allowance.
6. Thumbnail helper is at src/editor/components/thumbnails.ts (not src/editor/thumbnails.ts); jest-expo's expo-crypto mock returns '' / undefined, so mock it; jest-expo's legacy FS mock omits uploadAsync/createUploadTask.
