import { requireOptionalNativeModule } from "expo-modules-core";

type ClipyVideoNative = {
  hello(): string;
};

function native(): ClipyVideoNative {
  const mod = requireOptionalNativeModule<ClipyVideoNative>("ClipyVideo");
  if (!mod) {
    throw new Error(
      "ClipyVideo native module is not linked. Use a development build (eas build --profile development), not Expo Go.",
    );
  }
  return mod;
}

/** Returns a greeting from the Swift module. Phase 0 smoke test only. */
export function hello(): string {
  return native().hello();
}
