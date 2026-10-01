import { render, screen } from "@testing-library/react-native";
import { makeSticker } from "@/src/editor/model/types";
import { StickerView } from "../components/StickerView";

test("emoji stickers size from the frame; shapes render the registry path", async () => {
  await render(<StickerView sticker={makeSticker({ id: "s", emoji: "🔥", x: 0.5, y: 0.5, scale: 2 })} frameW={200} frameH={400} />);
  expect(screen.getByText("🔥")).toHaveStyle({ fontSize: 96 }); // 0.12 × 400 × 2
  expect(screen.getByTestId("sticker-s")).toHaveStyle({ left: 100, top: 200 });
  await render(<StickerView sticker={makeSticker({ id: "h", emoji: null, shape: "heart", color: "#FF0000" })} frameW={200} frameH={400} />);
  expect(screen.getByTestId("sticker-shape-h").props.fill).toBe("#FF0000");
});
