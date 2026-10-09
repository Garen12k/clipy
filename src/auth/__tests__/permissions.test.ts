jest.mock("expo-image-picker", () => ({
  getMediaLibraryPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(),
  getCameraPermissionsAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
}));
jest.mock("expo-audio", () => ({ getRecordingPermissionsAsync: jest.fn(), requestRecordingPermissionsAsync: jest.fn() }));
jest.mock("@/src/lib/notify", () => ({ notifyAvailable: jest.fn(), notifyState: jest.fn(), askToNotify: jest.fn() }));
jest.mock("@/src/projects/camera", () => ({ canUseCamera: jest.fn() }));
const mockPicker = jest.fn();
jest.mock("expo-media-library", () => ({ presentPermissionsPicker: mockPicker }));
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { readFileSync } from "fs";
import { join } from "path";
import { Linking } from "react-native";
import { askToNotify, notifyAvailable, notifyState } from "@/src/lib/notify";
import { canUseCamera } from "@/src/projects/camera";
import { askPermission, managePhotos, openSettings, PERMISSION_IDS, readPermission } from "../permissions";

const m = <T extends (...a: never[]) => unknown>(f: T) => f as unknown as jest.Mock;
const answer = (status: "granted" | "denied" | "undetermined", canAskAgain = true, more: object = {}) => ({ status, granted: status === "granted", canAskAgain, expires: "never", ...more });
const REQUESTS = [ImagePicker.requestMediaLibraryPermissionsAsync, ImagePicker.requestCameraPermissionsAsync, requestRecordingPermissionsAsync, askToNotify];
const READS = { photos: ImagePicker.getMediaLibraryPermissionsAsync, microphone: getRecordingPermissionsAsync, camera: ImagePicker.getCameraPermissionsAsync } as const;
let settings: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  settings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  m(canUseCamera).mockReturnValue(true); m(notifyAvailable).mockReturnValue(true);
});
afterEach(() => settings.mockRestore());

test("the four, in the order of the page", () => {
  expect(PERMISSION_IDS).toEqual(["photos", "microphone", "camera", "notifications"]);
});

describe("reading asks nothing: the state is what the phone says", () => {
  test.each(["photos", "microphone", "camera"] as const)("%s: not asked, allowed, refused, and only Settings can change it", async (id) => {
    const read = m(READS[id]);
    read.mockResolvedValue(answer("undetermined"));
    expect(await readPermission(id)).toBe("notAsked");
    read.mockResolvedValue(answer("granted"));
    expect(await readPermission(id)).toBe("granted");
    read.mockResolvedValue(answer("denied", true));
    expect(await readPermission(id)).toBe("denied");
    read.mockResolvedValue(answer("denied", false));
    expect(await readPermission(id)).toBe("denied");
    // Not decided but not askable either (a restriction): Settings, never a question.
    read.mockResolvedValue(answer("undetermined", false));
    expect(await readPermission(id)).toBe("denied");
    for (const f of REQUESTS) expect(f).not.toHaveBeenCalled();
  });

  test("Photos is read for what importing needs (not add-only), and only some photos chosen is limited", async () => {
    m(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValue(answer("granted", true, { accessPrivileges: "limited" }));
    expect(await readPermission("photos")).toBe("limited");
    expect(ImagePicker.getMediaLibraryPermissionsAsync).toHaveBeenCalledWith();
    m(ImagePicker.getMediaLibraryPermissionsAsync).mockResolvedValue(answer("granted", true, { accessPrivileges: "all" }));
    expect(await readPermission("photos")).toBe("granted");
  });

  test("notifications: the wrapper's own answer", async () => {
    for (const s of ["notAsked", "granted", "denied"]) { m(notifyState).mockResolvedValue(s); expect(await readPermission("notifications")).toBe(s); }
  });

  test("unavailable: an app without the camera's usage text is never asked ANYTHING about the camera; an app without notifications; a call that fails", async () => {
    m(canUseCamera).mockReturnValue(false);
    expect(await readPermission("camera")).toBe("unavailable");
    expect(await askPermission("camera")).toBe("unavailable");
    expect(ImagePicker.getCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    m(notifyAvailable).mockReturnValue(false);
    expect(await readPermission("notifications")).toBe("unavailable");
    expect(notifyState).not.toHaveBeenCalled();
    m(getRecordingPermissionsAsync).mockRejectedValue(new Error("no module"));
    expect(await readPermission("microphone")).toBe("unavailable");
    m(ImagePicker.getMediaLibraryPermissionsAsync).mockImplementation(() => { throw new Error("no module"); });
    expect(await readPermission("photos")).toBe("unavailable");
  });
});

describe("asking is ONE request — the feature's own call — and the answer is the state", () => {
  test("Photos: New project's call, with no argument (read access, never add-only)", async () => {
    m(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(answer("granted", true, { accessPrivileges: "limited" }));
    expect(await askPermission("photos")).toBe("limited");
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalledWith();
    for (const f of REQUESTS.slice(1)) expect(f).not.toHaveBeenCalled();
    // The same call the importer makes.
    expect(readFileSync(join(__dirname, "..", "..", "projects", "pickMedia.ts"), "utf8")).toContain("ImagePicker.requestMediaLibraryPermissionsAsync()");
  });

  test("the microphone: the voice-over recorder's call", async () => {
    m(requestRecordingPermissionsAsync).mockResolvedValue(answer("denied", false));
    expect(await askPermission("microphone")).toBe("denied");
    expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    for (const f of REQUESTS.filter((x) => x !== requestRecordingPermissionsAsync)) expect(f).not.toHaveBeenCalled();
    expect(readFileSync(join(__dirname, "..", "..", "editor", "useVoiceRecorder.ts"), "utf8")).toContain("await requestRecordingPermissionsAsync()");
  });

  test("the camera: the image picker's camera permission — the camera itself is never opened", async () => {
    m(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue(answer("granted"));
    expect(await askPermission("camera")).toBe("granted");
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    for (const f of REQUESTS.filter((x) => x !== ImagePicker.requestCameraPermissionsAsync)) expect(f).not.toHaveBeenCalled();
  });

  test("notifications: askToNotify, then the state is read", async () => {
    m(askToNotify).mockResolvedValue(true); m(notifyState).mockResolvedValue("granted");
    expect(await askPermission("notifications")).toBe("granted");
    expect(askToNotify).toHaveBeenCalledTimes(1);
    for (const f of REQUESTS.filter((x) => x !== askToNotify)) expect(f).not.toHaveBeenCalled();
  });

  test("a request that fails: the state is read instead, never a throw", async () => {
    m(requestRecordingPermissionsAsync).mockRejectedValue(new Error("boom"));
    m(getRecordingPermissionsAsync).mockResolvedValue(answer("undetermined"));
    expect(await askPermission("microphone")).toBe("notAsked");
  });
});

test("Open Settings is the app's page in Settings; a failure there is swallowed", async () => {
  openSettings();
  expect(settings).toHaveBeenCalledTimes(1);
  settings.mockRejectedValueOnce(new Error("no"));
  expect(() => openSettings()).not.toThrow();
});

describe("limited Photos", () => {
  test("the system's own picker, and Settings is not opened", async () => {
    mockPicker.mockResolvedValue(undefined);
    await managePhotos();
    expect(mockPicker).toHaveBeenCalledTimes(1);
    expect(settings).not.toHaveBeenCalled();
  });
  test("a picker that fails opens Settings instead", async () => {
    mockPicker.mockRejectedValue(new Error("unavailable"));
    await managePhotos();
    expect(settings).toHaveBeenCalledTimes(1);
  });
});
