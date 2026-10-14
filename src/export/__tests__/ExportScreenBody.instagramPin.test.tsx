import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: () => 0 }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { ExportScreenBody } from "../ExportScreenBody";

// PIN. The finished state's actions on a phone WITHOUT Instagram (no `onInstagram`), written from the screen as it was before
// Open Instagram existed (14 October 2026) and never updated: the button is added only when Instagram is there.
type Json = { type: string; props: Record<string, unknown>; children: (Json | string)[] | null };
function find(node: Json | string | null, id: string): Json | null {
  if (node === null || typeof node === "string") return null;
  if (node.props.testID === id) return node;
  for (const child of node.children ?? []) { const hit = find(child, id); if (hit) return hit; }
  return null;
}
function print(node: Json | string, depth: number, out: string[]): void {
  const pad = "  ".repeat(depth);
  if (typeof node === "string") { out.push(pad + JSON.stringify(node)); return; }
  const props: Record<string, unknown> = {};
  for (const key of Object.keys(node.props).sort()) {
    const value = node.props[key];
    if (typeof value === "function" || value === undefined) continue;
    props[key] = value;
  }
  out.push(`${pad}${node.type} ${JSON.stringify(props)}`);
  for (const child of node.children ?? []) print(child, depth + 1, out);
}
function actions(): string {
  const tree = screen.toJSON() as unknown as Json | Json[] | null;
  for (const top of Array.isArray(tree) ? tree : [tree]) {
    const hit = find(top, "export-actions");
    if (hit) { const out: string[] = []; print(hit, 0, out); return "\n" + out.join("\n") + "\n"; }
  }
  throw new Error("no export-actions");
}

const project = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 30 })] });
const done = { status: "done" as const, progress: 1, fileUri: "file:///out.mp4" };

test("without Instagram, the finished state's actions are as they were (Save to Photos gold, Share / Done)", async () => {
  await render(<ExportScreenBody project={project} state={done} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
  expect(actions()).toMatchInlineSnapshot(`
"
View {"style":{"paddingHorizontal":16,"gap":12},"testID":"export-actions"}
  View {"accessibilityLabel":"Save to Photos","accessibilityLargeContentTitle":"Save to Photos","accessibilityRole":"button","accessibilityShowsLargeContentViewer":true,"accessibilityState":{"disabled":false},"accessibilityValue":{},"accessible":true,"collapsable":false,"focusable":true,"style":[[{"height":48,"paddingHorizontal":24,"borderRadius":999,"flexDirection":"row","alignItems":"center","justifyContent":"center","gap":8},{"backgroundColor":"#D9B36A","opacity":1}],{"transform":[{"scale":1}]}],"testID":"primary-button"}
    Text {"maxFontSizeMultiplier":1.35,"style":[{"fontSize":17,"fontWeight":"600"},{"color":"#1A1408"}]}
      "Save to Photos"
  View {"style":{"flexDirection":"row","alignItems":"center","justifyContent":"space-between"},"testID":"export-quiet-row"}
    View {"accessibilityLabel":"Share","accessibilityLargeContentTitle":"Share","accessibilityRole":"button","accessibilityShowsLargeContentViewer":true,"accessibilityState":{"disabled":false},"accessibilityValue":{},"accessible":true,"collapsable":false,"focusable":true,"style":[[{"height":48,"paddingHorizontal":24,"borderRadius":999,"flexDirection":"row","alignItems":"center","justifyContent":"center","gap":8},{"paddingHorizontal":8,"minWidth":44,"opacity":1}],{"transform":[{"scale":1}]}]}
      Text {"accessibilityElementsHidden":true,"allowFontScaling":false,"importantForAccessibility":"no-hide-descendants","selectable":false,"style":[{"fontSize":20,"color":"#D9B36A"},null,{"fontFamily":"ionicons","fontWeight":"normal","fontStyle":"normal"},{}],"testID":"export-share-icon"}
        ""
      Text {"maxFontSizeMultiplier":1.35,"style":[{"fontSize":17,"fontWeight":"600"},{"color":"#D9B36A"}]}
        "Share"
    View {"accessibilityLabel":"Done","accessibilityLargeContentTitle":"Done","accessibilityRole":"button","accessibilityShowsLargeContentViewer":true,"accessibilityState":{"disabled":false},"accessibilityValue":{},"accessible":true,"collapsable":false,"focusable":true,"style":[[{"height":48,"paddingHorizontal":24,"borderRadius":999,"flexDirection":"row","alignItems":"center","justifyContent":"center","gap":8},{"paddingHorizontal":8,"minWidth":44,"opacity":1}],{"transform":[{"scale":1}]}]}
      Text {"maxFontSizeMultiplier":1.35,"style":[{"fontSize":17,"fontWeight":"600"},{"color":"#D9B36A"}]}
        "Done"
"
`);
});

test("without Instagram, with Post to…, the finished state's actions are as they were", async () => {
  await render(<ExportScreenBody project={project} state={done} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} onPost={jest.fn()} />);
  expect(actions()).toMatchInlineSnapshot(`
"
View {"style":{"paddingHorizontal":16,"gap":12},"testID":"export-actions"}
  View {"accessibilityLabel":"Post to…","accessibilityLargeContentTitle":"Post to…","accessibilityRole":"button","accessibilityShowsLargeContentViewer":true,"accessibilityState":{"disabled":false},"accessibilityValue":{},"accessible":true,"collapsable":false,"focusable":true,"style":[[{"height":48,"paddingHorizontal":24,"borderRadius":999,"flexDirection":"row","alignItems":"center","justifyContent":"center","gap":8},{"backgroundColor":"#D9B36A","opacity":1}],{"transform":[{"scale":1}]}],"testID":"primary-button"}
    Text {"maxFontSizeMultiplier":1.35,"style":[{"fontSize":17,"fontWeight":"600"},{"color":"#1A1408"}]}
      "Post to…"
  View {"accessibilityLabel":"Save to Photos","accessibilityLargeContentTitle":"Save to Photos","accessibilityRole":"button","accessibilityShowsLargeContentViewer":true,"accessibilityState":{"disabled":false},"accessibilityValue":{},"accessible":true,"collapsable":false,"focusable":true,"style":[[{"height":48,"paddingHorizontal":24,"borderRadius":999,"flexDirection":"row","alignItems":"center","justifyContent":"center","gap":8},{"backgroundColor":"#1F4572","opacity":1}],{"transform":[{"scale":1}]}]}
    Text {"maxFontSizeMultiplier":1.35,"style":[{"fontSize":17,"fontWeight":"600"},{"color":"#FFFFFF"}]}
      "Save to Photos"
  View {"style":{"flexDirection":"row","alignItems":"center","justifyContent":"space-between"},"testID":"export-quiet-row"}
    View {"accessibilityLabel":"Share","accessibilityLargeContentTitle":"Share","accessibilityRole":"button","accessibilityShowsLargeContentViewer":true,"accessibilityState":{"disabled":false},"accessibilityValue":{},"accessible":true,"collapsable":false,"focusable":true,"style":[[{"height":48,"paddingHorizontal":24,"borderRadius":999,"flexDirection":"row","alignItems":"center","justifyContent":"center","gap":8},{"paddingHorizontal":8,"minWidth":44,"opacity":1}],{"transform":[{"scale":1}]}]}
      Text {"accessibilityElementsHidden":true,"allowFontScaling":false,"importantForAccessibility":"no-hide-descendants","selectable":false,"style":[{"fontSize":20,"color":"#D9B36A"},null,{"fontFamily":"ionicons","fontWeight":"normal","fontStyle":"normal"},{}],"testID":"export-share-icon"}
        ""
      Text {"maxFontSizeMultiplier":1.35,"style":[{"fontSize":17,"fontWeight":"600"},{"color":"#D9B36A"}]}
        "Share"
    View {"accessibilityLabel":"Done","accessibilityLargeContentTitle":"Done","accessibilityRole":"button","accessibilityShowsLargeContentViewer":true,"accessibilityState":{"disabled":false},"accessibilityValue":{},"accessible":true,"collapsable":false,"focusable":true,"style":[[{"height":48,"paddingHorizontal":24,"borderRadius":999,"flexDirection":"row","alignItems":"center","justifyContent":"center","gap":8},{"paddingHorizontal":8,"minWidth":44,"opacity":1}],{"transform":[{"scale":1}]}]}
      Text {"maxFontSizeMultiplier":1.35,"style":[{"fontSize":17,"fontWeight":"600"},{"color":"#D9B36A"}]}
        "Done"
"
`);
});
