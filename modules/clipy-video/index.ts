import { requireNativeModule } from "expo-modules-core";

type ClipyVideoNative = {
  hello(): string;
};

const native = requireNativeModule<ClipyVideoNative>("ClipyVideo");

/** Returns a greeting from the Swift module. Phase 0 smoke test only. */
export function hello(): string {
  return native.hello();
}
