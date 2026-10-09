import { fireEvent, screen, within } from "@testing-library/react-native";

/**
 * Test helpers for the editor's bottom bar (never imported by the app). A long bar shows one GROUP of its tools at a time, so a test
 * that used to find any tool on the bar now says which group it is in — or asks for the tool wherever it is.
 */
const GROUP = /^Tool groups, (.+)$/;
type Node = ReturnType<typeof screen.getByRole>;
const label = (b: Node) => b.props.accessibilityLabel as string;

/** The group button; null on a flat bar and while the chooser shows. */
export const groupButton = (): Node | null => screen.queryByRole("button", { name: GROUP });
/** The group the row shows ("Basics"); null on a flat bar. */
export const currentGroup = (): string | null => { const b = groupButton(); return b ? GROUP.exec(label(b))![1] : null; };
/** The labels in the scrolling part of the row: the current group's tools, a flat bar's tools, or the chooser's groups. */
export const scrolled = (): string[] => within(screen.getByTestId("toolbar-scroll")).queryAllByRole("button").map(label);

/** The groups the chooser offers, in order. The row is back on the group it showed. */
export async function groupNames(): Promise<string[]> {
  const was = currentGroup();
  if (was === null) throw new Error("This bar has no group button: it is a flat row.");
  await fireEvent.press(groupButton()!);
  const names = scrolled();
  await fireEvent.press(within(screen.getByTestId("toolbar-scroll")).getByRole("button", { name: was }));
  return names;
}

/** Two taps: the group button, then the group. Nothing happens when the row already shows it. */
export async function showGroup(name: string): Promise<void> {
  const was = currentGroup();
  if (was === null) throw new Error(`This bar has no group button, so there is no "${name}" to show.`);
  if (was === name) return;
  await fireEvent.press(groupButton()!);
  await fireEvent.press(within(screen.getByTestId("toolbar-scroll")).getByRole("button", { name }));
}

/** Every tool of the bar by group, in the chooser's order (a flat bar: `{ "": tools }`). The row is back on the group it showed. */
export async function toolsByGroup(): Promise<Record<string, string[]>> {
  const was = currentGroup();
  if (was === null) return { "": scrolled() };
  const out: Record<string, string[]> = {};
  for (const name of await groupNames()) { await showGroup(name); out[name] = scrolled(); }
  await showGroup(was);
  return out;
}

/** Every tool the bar has — all its groups, then what is pinned (Delete) — without Back and the group button. The row is back on the group it showed. */
export async function everyTool(): Promise<string[]> {
  const inScroll = scrolled();
  const fixed = screen.getAllByRole("button").map(label).filter((l) => l !== "Back to main tools" && !GROUP.test(l));
  const pinned = fixed.slice(inScroll.length ? fixed.lastIndexOf(inScroll[inScroll.length - 1]) + 1 : 0);
  return [...Object.values(await toolsByGroup()).flat(), ...pinned];
}

/** The tools that are rendered disabled, over all the groups and what is pinned. The row is back on the group it showed. */
export async function disabledTools(): Promise<string[]> {
  const off = () => screen.getAllByRole("button").filter((b) => b.props.accessibilityState?.disabled).map(label);
  const was = currentGroup();
  if (was === null) return off();
  const out = new Set<string>();
  for (const name of await groupNames()) { await showGroup(name); for (const l of off()) out.add(l); }
  await showGroup(was);
  return [...out];
}

/** A tool's button, wherever it is: on the row now, pinned, or in another group (the row is then left on that group). */
export async function tool(name: string): Promise<Node> {
  const now = screen.queryByRole("button", { name });
  if (now) return now;
  if (currentGroup() !== null) for (const g of await groupNames()) {
    await showGroup(g);
    const found = screen.queryByRole("button", { name });
    if (found) return found;
  }
  throw new Error(`No tool "${name}" on this bar, in any group.`);
}
