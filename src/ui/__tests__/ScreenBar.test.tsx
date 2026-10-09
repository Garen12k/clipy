import { fireEvent, render, screen } from "@testing-library/react-native";
import { theme } from "@/src/theme/theme";
import { LEADING_ICON, ScreenBar } from "../ScreenBar";
import { ToneContext } from "../tone";

test("the title is the screen's header: centred, headline size, semibold", async () => {
  await render(<ScreenBar title="Accounts" leading="back" onLeading={() => {}} />);
  const title = screen.getByRole("header", { name: "Accounts" });
  expect(title).toHaveStyle({ fontSize: theme.type.headline, fontWeight: theme.weight.semi, textAlign: "center", color: theme.colors.text });
  expect(title).toHaveProp("numberOfLines", 1);
  expect(screen.getByTestId("screen-bar")).toHaveStyle({ height: theme.size.header, flexDirection: "row", alignItems: "center" });
});

test("back: a round button called Back that calls onLeading", async () => {
  const onLeading = jest.fn();
  await render(<ScreenBar title="Post" leading="back" onLeading={onLeading} />);
  const back = screen.getByRole("button", { name: "Back" });
  expect(back).toHaveStyle({ width: theme.size.controlCompact, height: theme.size.controlCompact, borderRadius: theme.radius.pill, backgroundColor: theme.screen.tile, opacity: 1 });
  // 36 pt drawn, 4 pt of slop each way: a 44-pt target inside the 44-pt bar.
  expect(back).toHaveProp("hitSlop", 4);
  expect(theme.size.controlCompact + 2 * 4).toBe(theme.size.touch);
  expect(LEADING_ICON).toEqual({ back: "chevron-back-outline", close: "close-outline" });
  await fireEvent.press(back);
  expect(onLeading).toHaveBeenCalledTimes(1);
});

test("close: an X called Close; leadingLabel renames either", async () => {
  const view = await render(<ScreenBar title="Export" leading="close" onLeading={() => {}} />);
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  await view.unmount();
  await render(<ScreenBar title="Export" leading="close" leadingLabel="Close export" onLeading={() => {}} />);
  expect(screen.getByRole("button", { name: "Close export" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
});

test("a disabled leading button is dimmed and inert", async () => {
  const onLeading = jest.fn();
  await render(<ScreenBar title="Export" leading="close" onLeading={onLeading} leadingDisabled />);
  const close = screen.getByRole("button", { name: "Close" });
  expect(close).toBeDisabled();
  expect(close).toHaveStyle({ opacity: 0.4 });
  await fireEvent.press(close);
  expect(onLeading).not.toHaveBeenCalled();
});

test("nothing trailing: the title is centred by a spacer as wide as the button", async () => {
  await render(<ScreenBar title="Post" leading="back" onLeading={() => {}} />);
  expect(screen.getByTestId("screen-bar-trailing")).toHaveStyle({ width: theme.size.controlCompact });
  expect(screen.getAllByRole("button")).toHaveLength(1);
});

test("in the editor's tone the circle is the slate step", async () => {
  await render(<ToneContext.Provider value="editor"><ScreenBar title="Crop" leading="close" onLeading={() => {}} /></ToneContext.Provider>);
  expect(screen.getByRole("button", { name: "Close" })).toHaveStyle({ backgroundColor: theme.surfaces.editor.tile });
});
