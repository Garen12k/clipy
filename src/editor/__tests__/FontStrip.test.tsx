import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { theme } from "@/src/theme/theme";
import { FontStrip } from "../components/FontStrip";

test("a font is picked with one tap while the keyboard is up: the strip does not swallow the tap to dismiss it", async () => {
  const onChange = jest.fn();
  await render(<FontStrip value="anton" onChange={onChange} />);
  expect(screen.getByTestId("font-strip").props).toMatchObject({ horizontal: true, keyboardShouldPersistTaps: "handled" });
  await fireEvent.press(screen.getByRole("button", { name: "Oswald" }));
  expect(onChange).toHaveBeenCalledWith("oswald");
});

test("the selected chip is not lifted: the strip is exactly as tall as its chips, so a 3 % lift would clip the ring", async () => {
  await render(<FontStrip value="anton" onChange={() => {}} />);
  const style = StyleSheet.flatten(screen.getByRole("button", { name: "Anton" }).props.style);
  expect(style.transform).toEqual([{ scale: 1 }]);
  expect(screen.getByRole("button", { name: "Anton" })).toHaveStyle(theme.ring);
});
