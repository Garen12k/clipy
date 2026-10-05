import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme/theme";
import { crossed, Slider } from "../Slider";

const ticks = () => (Haptics.impactAsync as jest.Mock).mock.calls.length;
beforeEach(() => { (Haptics.impactAsync as jest.Mock).mockClear(); });

test("crossed: reaching or passing a detent counts, from either side; leaving it or staying short of it does not", () => {
  expect(crossed(0.8, 1, [1])).toBe(true);
  expect(crossed(0.8, 1.2, [1])).toBe(true);
  expect(crossed(1.2, 0.9, [1])).toBe(true);
  expect(crossed(1, 1.2, [1])).toBe(false);
  expect(crossed(1, 1, [1])).toBe(false);
  expect(crossed(0.5, 0.8, [1])).toBe(false);
  expect(crossed(-0.2, 0.3, [0, 1])).toBe(true);
  expect(crossed(0.2, 0.3, [])).toBe(false);
});

test("themed by default; the caller's tint wins; every prop and handler passes through with the value untouched", async () => {
  const onStart = jest.fn(), onChange = jest.fn(), onDone = jest.fn();
  await render(<><Slider testID="a" value={0.5} minimumValue={0} maximumValue={2} step={0.05} onSlidingStart={onStart} onValueChange={onChange} onSlidingComplete={onDone} />
    <Slider testID="b" value={1} thumbTintColor={theme.colors.textMuted} /></>);
  const a = screen.getByTestId("a");
  expect(a.props).toMatchObject({ value: 0.5, minimumValue: 0, maximumValue: 2, step: 0.05,
    minimumTrackTintColor: theme.colors.accent, maximumTrackTintColor: theme.elevation.tile, thumbTintColor: theme.colors.accent });
  expect(screen.getByTestId("b").props.thumbTintColor).toBe(theme.colors.textMuted);
  await fireEvent(a, "slidingStart", 0.5);
  await fireEvent(a, "valueChange", 0.73);
  await fireEvent(a, "slidingComplete", 0.73);
  expect(onStart).toHaveBeenCalledWith(0.5);
  expect(onChange).toHaveBeenCalledWith(0.73);
  expect(onDone).toHaveBeenCalledWith(0.73);
  expect(ticks()).toBe(0);                                             // no detents: never a tick
});

test("a light tick when a drag reaches or passes a detent — not at the start, not while moving away, not without a drag start", async () => {
  await render(<Slider testID="s" value={0.5} detents={[1]} onValueChange={() => {}} />);
  const s = screen.getByTestId("s");
  await fireEvent(s, "valueChange", 1.5);                              // no slidingStart yet: nothing to compare with
  expect(ticks()).toBe(0);
  await fireEvent(s, "slidingStart", 0.5);
  await fireEvent(s, "valueChange", 0.8);
  expect(ticks()).toBe(0);
  await fireEvent(s, "valueChange", 1);                                // lands on it
  expect(ticks()).toBe(1);
  expect(Haptics.impactAsync).toHaveBeenLastCalledWith(Haptics.ImpactFeedbackStyle.Light);
  await fireEvent(s, "valueChange", 1);                                // rests on it: once per crossing
  expect(ticks()).toBe(1);
  await fireEvent(s, "valueChange", 1.2);                              // leaves it
  expect(ticks()).toBe(1);
  await fireEvent(s, "valueChange", 0.9);                              // passes it going down
  expect(ticks()).toBe(2);
  await fireEvent(s, "slidingStart");                                  // the suites fire it without a value: no crash, no tick
  await fireEvent(s, "valueChange", 1.4);
  expect(ticks()).toBe(2);
});

test("no tick on mount, when the value changes from outside (undo, another control), after the drag has ended, or on a disabled slider", async () => {
  const onChange = jest.fn(), onDone = jest.fn();
  const view = await render(<Slider testID="s" value={0.5} detents={[1]} onValueChange={onChange} onSlidingComplete={onDone} />);
  expect(ticks()).toBe(0);                                             // mount
  await view.rerender(<Slider testID="s" value={1.5} detents={[1]} onValueChange={onChange} onSlidingComplete={onDone} />);
  expect(ticks()).toBe(0);                                             // the prop went over the detent: not a drag
  const s = screen.getByTestId("s");
  expect(s.props.value).toBe(1.5);                                     // and never snapped
  await fireEvent(s, "slidingStart", 1.5);
  await fireEvent(s, "valueChange", 1.2);
  await fireEvent(s, "slidingComplete", 1.2);
  expect(onDone).toHaveBeenCalledWith(1.2);
  await fireEvent(s, "valueChange", 0.4);                              // after the drag: nothing to compare with again
  expect(ticks()).toBe(0);
  expect(onChange).toHaveBeenLastCalledWith(0.4);
  await view.rerender(<Slider testID="s" value={0.5} detents={[1]} disabled onValueChange={onChange} />);
  const d = screen.getByTestId("s");
  expect(d.props.disabled).toBe(true);
  await fireEvent(d, "slidingStart", 0.5);
  await fireEvent(d, "valueChange", 1.5);
  expect(ticks()).toBe(0);
});
