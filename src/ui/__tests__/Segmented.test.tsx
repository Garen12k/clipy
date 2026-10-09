import { fireEvent, render, screen } from "@testing-library/react-native";
import { withSpring, withTiming } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";
import { Segmented } from "../Segmented";
import { ToneContext } from "../tone";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withSpring: jest.fn(m.withSpring), withTiming: jest.fn(m.withTiming) };
});

const OPTIONS = [{ value: 720, label: "720p" }, { value: 1080, label: "1080p" }, { value: 2160, label: "4K", disabled: true }] as const;
const seg = (name: string) => screen.getByRole("button", { name });

test("the picked segment says so, the others do not; labels are shown as typed", async () => {
  await render(<Segmented options={[{ value: "high", label: "High" }, { value: "small", label: "Smaller file" }]} value="small" onChange={() => {}} />);
  expect(seg("Smaller file")).toBeSelected();
  expect(seg("High")).not.toBeSelected();
  expect(screen.getByText("Smaller file")).toBeTruthy();                                   // sentence style, not forced into capitals
  expect(screen.getByText("Smaller file")).not.toHaveStyle({ textTransform: "uppercase" });
});

test("a press calls back with that segment's value", async () => {
  const onChange = jest.fn();
  await render(<Segmented options={OPTIONS} value={1080} onChange={onChange} />);
  await fireEvent.press(seg("720p"));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(720);
});

test("a disabled segment is dimmed and inert", async () => {
  const onChange = jest.fn();
  await render(<Segmented options={OPTIONS} value={1080} onChange={onChange} />);
  expect(seg("4K")).toBeDisabled();
  expect(seg("4K")).toHaveStyle({ opacity: 0.4 });
  await fireEvent.press(seg("4K"));
  expect(onChange).not.toHaveBeenCalled();
  expect(seg("720p")).not.toBeDisabled();
  expect(seg("720p")).toHaveStyle({ opacity: 1 });
});

test("one rounded track of equal segments; the picked one is a lighter step with semibold text; each target is 44 pt", async () => {
  await render(<Segmented testID="track" options={OPTIONS} value={1080} onChange={() => {}} />);
  expect(screen.getByTestId("track")).toHaveStyle({ flexDirection: "row", height: theme.size.touch, backgroundColor: theme.screen.tile });
  for (const n of ["720p", "1080p", "4K"]) expect(seg(n)).toHaveStyle({ flex: 1 });
  expect(seg("1080p")).toHaveStyle({ backgroundColor: theme.screen.lifted });
  expect(seg("720p")).not.toHaveStyle({ backgroundColor: theme.screen.lifted });
  expect(screen.getByText("1080p")).toHaveStyle({ fontWeight: theme.weight.semi, color: theme.colors.text });
  expect(screen.getByText("720p")).toHaveStyle({ fontWeight: theme.weight.regular });
  // The segment is drawn inside the track's padding; its slop reaches the track's edges, and no further.
  const slop = seg("720p").props.hitSlop;
  expect(theme.size.touch - 2 * theme.space.xs + slop.top + slop.bottom).toBe(theme.size.touch);
});

test("in the editor's family it takes the editor's steps", async () => {
  await render(<ToneContext.Provider value="editor"><Segmented testID="track" options={OPTIONS} value={1080} onChange={() => {}} /></ToneContext.Provider>);
  expect(screen.getByTestId("track")).toHaveStyle({ backgroundColor: theme.surfaces.editor.tile });
  expect(seg("1080p")).toHaveStyle({ backgroundColor: theme.surfaces.editor.lifted });
});

test("nothing animates: not the mount, not a press, not a change of the pick", async () => {
  const view = await render(<Segmented options={OPTIONS} value={1080} onChange={() => {}} />);
  await fireEvent(seg("720p"), "pressIn");
  await fireEvent(seg("720p"), "pressOut");
  await view.rerender(<Segmented options={OPTIONS} value={720} onChange={() => {}} />);
  expect(seg("720p")).toBeSelected();
  expect(withTiming).not.toHaveBeenCalled();
  expect(withSpring).not.toHaveBeenCalled();
});
