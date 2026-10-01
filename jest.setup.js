// jest-expo's preset lazily installs `global.fetch` via a getter the first time
// it is read (see expo/src/winter/installGlobal.ts). That first read resolves
// `ExpoFetchModule` through `requireNativeModule`, which only works correctly
// while jest-expo's own `expo-modules-core` mock (registered in its setup file)
// is active. If a test file supplies its own `jest.mock("expo-modules-core", ...)`
// (as modules/clipy-video/__tests__/index.test.ts does), that mock replaces
// jest-expo's and does not know about `ExpoFetchModule`, so the first access to
// `fetch` would throw if it happened inside the test file instead of here.
//
// Forcing the lazy getter to resolve now, while jest-expo's preset setup (which
// runs immediately before this file, per `setupFiles` ordering) is still the
// active mock, caches a real value on `global.fetch` so later test-level mocks
// of `expo-modules-core` never need to satisfy that lookup.
void globalThis.fetch;

// The access above necessarily requires `expo-modules-core` (transitively, to
// resolve `ExpoFetchModule`), which caches that module in Jest's per-test-file
// module registry under jest-expo's own mock. Reset the registry so a test
// file's own `jest.mock("expo-modules-core", ...)` controls what later
// `require("expo-modules-core")` calls (e.g. from app code under test) receive,
// instead of reusing the cached jest-expo-mocked instance from the line above.
jest.resetModules();
