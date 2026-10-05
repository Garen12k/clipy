import { fireEvent, render, screen } from "@testing-library/react-native";
import { FontStrip } from "../components/FontStrip";

test("a font is picked with one tap while the keyboard is up: the strip does not swallow the tap to dismiss it", async () => {
  const onChange = jest.fn();
  await render(<FontStrip value="anton" onChange={onChange} />);
  expect(screen.getByTestId("font-strip").props).toMatchObject({ horizontal: true, keyboardShouldPersistTaps: "handled" });
  await fireEvent.press(screen.getByRole("button", { name: "Oswald" }));
  expect(onChange).toHaveBeenCalledWith("oswald");
});
