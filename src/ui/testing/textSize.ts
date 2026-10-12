import { act, screen } from "@testing-library/react-native";

type TestPhone = { __setFontScale: (scale: number) => void };
/**
 * Tests only: the user moves the phone's text-size slider while the app is open. 1 = the default; 1.353 = the largest standard size;
 * 3.571 = the largest accessibility size. The size outlives the test: end a suite that uses it with `afterEach(() => textSize(1))`.
 */
export async function textSize(scale: number): Promise<void> {
  await act(async () => { (jest.requireMock("@/src/ui/phoneTextSize") as TestPhone).__setFontScale(scale); });
}

type Json = { type: string; props: Record<string, unknown>; children: (Json | string)[] | null };
export type TextNode = { type: string; props: Record<string, unknown>; text: string };
const words = (node: Json | string): string => (typeof node === "string" ? node : (node.children ?? []).map(words).join(""));

/** Every text and text field on screen as the phone is given it (host `Text` / `TextInput`), nested spans and icon glyphs included. */
export function texts(): TextNode[] {
  const found: TextNode[] = [];
  const walk = (node: Json | string | null) => {
    if (!node || typeof node === "string") return;
    if (/Text/.test(node.type)) found.push({ type: node.type, props: node.props, text: words(node) });
    for (const child of node.children ?? []) walk(child);
  };
  const tree = screen.toJSON() as unknown as Json | Json[] | null;
  for (const top of Array.isArray(tree) ? tree : [tree]) walk(top);
  return found;
}

/** The texts that would follow the phone without a limit: neither a cap of 1 or more nor `allowFontScaling={false}`. Empty on anything built from the kit. */
export function unruled(): string[] {
  return texts().filter((t) => t.props.allowFontScaling !== false && !(typeof t.props.maxFontSizeMultiplier === "number" && t.props.maxFontSizeMultiplier >= 1))
    .map((t) => `${t.type} "${t.text}"`);
}
