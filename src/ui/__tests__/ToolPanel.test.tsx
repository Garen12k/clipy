import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions, Keyboard, Text, TextInput } from "react-native";
import { useKeyboard } from "../keyboard";
import { PANEL, panelHeight, ToolPanel, usePanelPresence } from "../ToolPanel";

const H = Dimensions.get("window").height;

afterEach(() => { useKeyboard.setState({ height: 0 }); });

test("panelHeight: regular is 46 % of the window between 300 and 430, compact is 240, typing is 22 % between 148 and 200", () => {
  expect(PANEL).toMatchObject({ header: 44, lead: 44, compact: 240 });
  for (const [h, regular, typing] of [[667, 307, 148], [812, 374, 179], [852, 392, 187], [932, 429, 200], [956, 430, 200], [500, 300, 148]]) {
    expect(panelHeight("regular", h)).toBe(regular);
    expect(panelHeight("regular", h, true)).toBe(typing);
    expect(panelHeight("compact", h, true)).toBe(typing);
    expect(panelHeight("compact", h)).toBe(240);
  }
});

test("renders inline with explicit heights: a header title, a scrolling body — and no scrim", async () => {
  await render(<ToolPanel visible onClose={() => {}} title="Templates"><Text>body</Text></ToolPanel>);
  const height = panelHeight("regular", H) - 1;
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height });
  expect(screen.getByRole("header", { name: "Templates" })).toBeTruthy();
  const body = screen.getByTestId("tool-panel-body");
  expect(body).toHaveStyle({ height: height - PANEL.header });
  expect(body.props.horizontal).toBeFalsy();
  expect(Object.keys(body.props).filter((k) => /^on.*Scroll/.test(k))).toEqual([]);
  expect(screen.getByText("body")).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();        // the modal Sheet's scrim
  expect(screen.queryByTestId("tool-panel-lead")).toBeNull();
});

test("Done closes; the action runs", async () => {
  const onClose = jest.fn(), onAction = jest.fn();
  await render(<ToolPanel visible onClose={onClose} title="Text" action={{ label: "Apply to all", onPress: onAction }}><Text>body</Text></ToolPanel>);
  await fireEvent.press(screen.getByRole("button", { name: "Apply to all" }));
  expect(onAction).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("compact is 240; a lead row is 44 and the body gives it up; the body test id can be named", async () => {
  await render(<ToolPanel visible onClose={() => {}} title="Sticker" size="compact" lead={<Text>tabs</Text>} bodyTestID="my-scroll"><Text>body</Text></ToolPanel>);
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: 239 });
  expect(screen.getByTestId("tool-panel-lead")).toHaveStyle({ height: 44 });
  expect(screen.getByText("tabs")).toBeTruthy();
  expect(screen.getByTestId("my-scroll")).toHaveStyle({ height: 239 - 44 - 44 });
});

test("scroll={false}: a plain body of explicit height, and a function child is told that height", async () => {
  const child = jest.fn((h: number) => <Text>{`h=${h}`}</Text>);
  await render(<ToolPanel visible onClose={() => {}} title="Sticker" scroll={false}>{child}</ToolPanel>);
  const bodyH = panelHeight("regular", H) - 1 - PANEL.header;
  expect(child).toHaveBeenCalledWith(bodyH);
  expect(screen.getByText(`h=${bodyH}`)).toBeTruthy();
  const body = screen.getByTestId("tool-panel-body");
  expect(body).toHaveStyle({ height: bodyH });
  expect(body.props.contentContainerStyle).toBeUndefined();          // not a ScrollView
});

test("hidden: renders nothing and is not counted; visible: counted with its size while mounted", async () => {
  const view = await render(<ToolPanel visible={false} onClose={() => {}} title="Beats" size="compact"><Text>body</Text></ToolPanel>);
  expect(screen.queryByText("body")).toBeNull();
  expect(usePanelPresence.getState().count).toBe(0);
  await view.rerender(<ToolPanel visible onClose={() => {}} title="Beats" size="compact"><Text>body</Text></ToolPanel>);
  expect(usePanelPresence.getState()).toEqual({ count: 1, size: "compact" });
  await view.rerender(<ToolPanel visible={false} onClose={() => {}} title="Beats" size="compact"><Text>body</Text></ToolPanel>);
  expect(usePanelPresence.getState().count).toBe(0);
  await view.rerender(<ToolPanel visible onClose={() => {}} title="Beats"><Text>body</Text></ToolPanel>);
  expect(usePanelPresence.getState()).toEqual({ count: 1, size: "regular" });
  await view.unmount();
  expect(usePanelPresence.getState().count).toBe(0);
});

test("with the keyboard up the panel takes its typing height and drops the lead; it comes back when the keyboard goes", async () => {
  await render(<ToolPanel visible onClose={() => {}} title="Sticker" lead={<Text>tabs</Text>}><Text>body</Text></ToolPanel>);
  await act(() => { useKeyboard.setState({ height: 336 }); });
  const typing = panelHeight("regular", H, true) - 1;
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: typing });
  expect(screen.queryByTestId("tool-panel-lead")).toBeNull();
  expect(screen.getByTestId("tool-panel-body")).toHaveStyle({ height: typing - PANEL.header });
  expect(screen.getByText("body")).toBeTruthy();                       // still open
  await act(() => { useKeyboard.setState({ height: 0 }); });
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H) - 1 });
  expect(screen.getByTestId("tool-panel-lead")).toBeTruthy();
});

test("when the keyboard comes up a scrolling panel measures the focused field to bring it into view", async () => {
  const measureLayout = jest.fn();
  const focused = jest.spyOn(TextInput.State, "currentlyFocusedInput").mockReturnValue({ measureLayout } as never);
  await render(<ToolPanel visible onClose={() => {}} title="Text"><TextInput accessibilityLabel="field" /></ToolPanel>);
  expect(measureLayout).not.toHaveBeenCalled();
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(measureLayout).toHaveBeenCalledTimes(1);
  focused.mockRestore();
});

test("hiding the panel dismisses the keyboard", async () => {
  const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
  const view = await render(<ToolPanel visible onClose={() => {}} title="Text"><Text>body</Text></ToolPanel>);
  expect(dismiss).not.toHaveBeenCalled();
  await view.rerender(<ToolPanel visible={false} onClose={() => {}} title="Text"><Text>body</Text></ToolPanel>);
  expect(dismiss).toHaveBeenCalledTimes(1);
  dismiss.mockRestore();
});
