import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("../components/OverlayText", () => ({ OverlayText: jest.fn(() => null) }));
import { TEXT_TEMPLATE_IDS } from "@/src/editor/textTemplates";
import { OverlayText } from "../components/OverlayText";
import { TemplateStrip, TEXT_TEMPLATE_TILES } from "../components/TemplateStrip";

const drawn = OverlayText as unknown as jest.Mock;

test("a parent re-render with the same tiles (and a new onPick function) draws no tile again; a press reaches the latest onPick", async () => {
  drawn.mockClear();
  const first = jest.fn();
  const view = await render(<TemplateStrip tiles={TEXT_TEMPLATE_TILES} onPick={(id) => first(id)} />);
  expect(drawn).toHaveBeenCalledTimes(TEXT_TEMPLATE_IDS.length);
  drawn.mockClear();
  const second = jest.fn();
  await view.rerender(<TemplateStrip tiles={TEXT_TEMPLATE_TILES} onPick={(id) => second(id)} />);
  expect(drawn).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Comic" }));
  expect(second).toHaveBeenCalledWith("comic");
  expect(first).not.toHaveBeenCalled();
});
