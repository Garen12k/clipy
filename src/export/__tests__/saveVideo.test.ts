const mockNative = { there: true };
jest.mock("expo-modules-core", () => ({ ...jest.requireActual("expo-modules-core"), requireOptionalNativeModule: jest.fn((name: string) => (name === "ExpoMediaLibraryNext" && mockNative.there ? {} : null)) }));
const mockCreate = jest.fn();
jest.mock("expo-media-library", () => ({ Asset: { create: (...a: unknown[]) => mockCreate(...a) } }));
import { requestPermissionsAsync, saveToLibraryAsync } from "expo-media-library/legacy";
import { saveVideoToPhotos } from "../saveVideo";

beforeEach(() => {
  jest.clearAllMocks();
  mockNative.there = true;
  (requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
});

test("asks for add-only Photos access (as Save to Photos always did), saves, and returns the asset's local identifier", async () => {
  mockCreate.mockResolvedValue({ id: "ph://ABCD-12/L0/001" });
  expect(await saveVideoToPhotos("file:///out.mp4")).toEqual({ saved: true, localIdentifier: "ABCD-12/L0/001" });
  expect(requestPermissionsAsync).toHaveBeenCalledWith(true);
  expect(mockCreate).toHaveBeenCalledWith("file:///out.mp4");
  expect(saveToLibraryAsync).not.toHaveBeenCalled();
});

test("an id without the ph:// prefix is the identifier itself", async () => {
  mockCreate.mockResolvedValue({ id: "ABCD-12/L0/001" });
  expect(await saveVideoToPhotos("file:///out.mp4")).toEqual({ saved: true, localIdentifier: "ABCD-12/L0/001" });
});

test("refused: nothing is saved", async () => {
  (requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
  expect(await saveVideoToPhotos("file:///out.mp4")).toEqual({ saved: false });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(saveToLibraryAsync).not.toHaveBeenCalled();
});

test("an installed app without the module saves as before, with no identifier", async () => {
  mockNative.there = false;
  expect(await saveVideoToPhotos("file:///out.mp4")).toEqual({ saved: true, localIdentifier: null });
  expect(saveToLibraryAsync).toHaveBeenCalledWith("file:///out.mp4");
  expect(mockCreate).not.toHaveBeenCalled();
});

test("a failed save throws, and is never tried a second way (no second copy in Photos)", async () => {
  mockCreate.mockRejectedValue(new Error("disk full"));
  await expect(saveVideoToPhotos("file:///out.mp4")).rejects.toThrow("disk full");
  expect(saveToLibraryAsync).not.toHaveBeenCalled();
});
