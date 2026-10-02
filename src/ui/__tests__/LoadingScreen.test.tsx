import { act, render, screen } from "@testing-library/react-native";
import { LoadingScreen } from "../LoadingScreen";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("shows the brand and calls onGone after leaving", async () => {
  const onGone = jest.fn();
  const view = await render(<LoadingScreen leaving={false} onGone={onGone} />);
  expect(screen.getByText("CLIPY")).toBeTruthy();
  expect(screen.getByText("EDIT · SET SAIL · SHARE")).toBeTruthy();
  expect(screen.getByLabelText("Clipy compass")).toBeTruthy();
  expect(onGone).not.toHaveBeenCalled();
  await view.rerender(<LoadingScreen leaving onGone={onGone} />);
  await act(() => { jest.advanceTimersByTime(400); });
  expect(onGone).toHaveBeenCalledTimes(1);
});
