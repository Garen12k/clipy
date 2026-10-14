import { act, render } from "@testing-library/react-native";
import { AppState, Linking, Text, type AppStateStatus } from "react-native";
import { instagramInstalled, INSTAGRAM_FAILED, instagramLibraryUrl, openInInstagram, useInstagramInstalled } from "../openInstagram";

let listeners: ((s: AppStateStatus) => void)[];
beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  listeners = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, l) => { listeners.push(l as (s: AppStateStatus) => void); return { remove: () => { listeners = listeners.filter((x) => x !== l); } } as never; });
});

describe("instagramInstalled", () => {
  test("asks iOS about the instagram scheme and says what it answers", async () => {
    const can = jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    expect(await instagramInstalled()).toBe(true);
    expect(can).toHaveBeenCalledWith("instagram://");
    can.mockResolvedValue(false);
    expect(await instagramInstalled()).toBe(false);
  });
  test("a refusal (the scheme not declared in the installed app's Info.plist) is not installed", async () => {
    jest.spyOn(Linking, "canOpenURL").mockRejectedValue(new Error("Add instagram to LSApplicationQueriesSchemes"));
    expect(await instagramInstalled()).toBe(false);
  });
});

describe("openInInstagram", () => {
  test("the library URL carries the Photos asset's local identifier, encoded", () => {
    expect(instagramLibraryUrl("ABCD-12/L0/001")).toBe("instagram://library?LocalIdentifier=ABCD-12%2FL0%2F001");
  });
  test("opens Instagram's library on the video", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    expect(await openInInstagram("ABCD-12/L0/001")).toBe(true);
    expect(open.mock.calls).toEqual([["instagram://library?LocalIdentifier=ABCD-12%2FL0%2F001"]]);
  });
  test("when the library URL is refused, Instagram itself is opened", async () => {
    const open = jest.spyOn(Linking, "openURL").mockRejectedValueOnce(new Error("no")).mockResolvedValueOnce(true);
    expect(await openInInstagram("X/L0/001")).toBe(true);
    expect(open.mock.calls).toEqual([["instagram://library?LocalIdentifier=X%2FL0%2F001"], ["instagram://app"]]);
  });
  test("with no identifier (an app that could not say which asset), Instagram itself is opened", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    expect(await openInInstagram(null)).toBe(true);
    expect(open.mock.calls).toEqual([["instagram://app"]]);
  });
  test("when both are refused it answers false (the caller says one sentence) and asks nothing more", async () => {
    const open = jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no"));
    expect(await openInInstagram("X/L0/001")).toBe(false);
    expect(open).toHaveBeenCalledTimes(2);
    expect(INSTAGRAM_FAILED).toBe("Instagram could not be opened.");
  });
});

describe("useInstagramInstalled", () => {
  function Probe({ on }: { on: boolean }) {
    return <Text testID="v">{String(useInstagramInstalled(on))}</Text>;
  }
  test("reads once when the finished state appears, not per render, and again when the app comes back to the front", async () => {
    const can = jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    const view = await render(<Probe on={false} />);
    expect(can).not.toHaveBeenCalled();
    expect(view.getByTestId("v")).toHaveTextContent("false");
    await view.rerender(<Probe on />);
    await act(async () => {});
    expect(view.getByTestId("v")).toHaveTextContent("true");
    await view.rerender(<Probe on />);
    await act(async () => {});
    expect(can).toHaveBeenCalledTimes(1);
    can.mockResolvedValue(false);
    await act(async () => { listeners.forEach((l) => l("background")); });
    expect(can).toHaveBeenCalledTimes(1);
    await act(async () => { listeners.forEach((l) => l("active")); });
    expect(can).toHaveBeenCalledTimes(2);
    expect(view.getByTestId("v")).toHaveTextContent("false");
  });
  test("off again, it is false and no longer listens", async () => {
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    const view = await render(<Probe on />);
    await act(async () => {});
    expect(view.getByTestId("v")).toHaveTextContent("true");
    await view.rerender(<Probe on={false} />);
    expect(view.getByTestId("v")).toHaveTextContent("false");
    expect(listeners).toHaveLength(0);
  });
});
