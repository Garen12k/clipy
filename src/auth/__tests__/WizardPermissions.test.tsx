import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("../permissions", () => ({
  ...jest.requireActual("../permissions"),
  readPermission: jest.fn(), askPermission: jest.fn(), managePhotos: jest.fn(async () => {}), openSettings: jest.fn(),
}));
import { AppState, type AppStateStatus } from "react-native";
import { theme } from "@/src/theme/theme";
import { DISABLED_OPACITY } from "@/src/ui/buttonStyle";
import { askPermission, managePhotos, openSettings, readPermission, type PermissionId, type PermissionState } from "../permissions";
import { PERMISSION_ROWS, PermissionRows } from "../WizardPermissions";

const m = <T extends (...a: never[]) => unknown>(f: T) => f as unknown as jest.Mock;
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
type Phone = Record<PermissionId, PermissionState>;
const NOT_ASKED: Phone = { photos: "notAsked", microphone: "notAsked", camera: "notAsked", notifications: "notAsked" };
/** What the phone says now; a test changes it and the page must read it again to know. */
let phone: Phone;
const row = (id: PermissionId) => screen.getByTestId(`permission-${id}`);
const button = (name: string) => screen.getByRole("button", { name });
/** The app's state listeners, so a test can bring the app back to the front. */
let listeners: ((s: AppStateStatus) => void)[];
const comeBack = () => act(async () => { for (const l of listeners) l("active"); });

beforeEach(() => {
  jest.clearAllMocks();
  phone = { ...NOT_ASKED };
  m(readPermission).mockImplementation(async (id: PermissionId) => phone[id]);
  m(askPermission).mockImplementation(async (id: PermissionId) => (phone[id] = "granted"));
  listeners = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, l) => { listeners.push(l as (s: AppStateStatus) => void); return { remove: () => { listeners = listeners.filter((x) => x !== l); } } as never; });
});
afterEach(() => jest.restoreAllMocks());

test("four rows, as written: the name, the one-line reason — and the line about Settings under them", async () => {
  await render(<PermissionRows play />);
  const want: [PermissionId, string, string][] = [["photos", "Photos and videos", "To add your clips"], ["microphone", "Microphone", "For voice-overs"], ["camera", "Camera", "To film new clips"], ["notifications", "Notifications", "When an export is done"]];
  for (const [id, name, reason] of want) {
    expect(within(row(id)).getByText(name)).toBeTruthy();
    expect(within(row(id)).getByText(reason)).toBeTruthy();
    expect(within(row(id)).getByLabelText(`${name}. ${reason}.`)).toBeTruthy();
  }
  expect(Object.keys(PERMISSION_ROWS)).toEqual(["photos", "microphone", "camera", "notifications"]);
  expect(screen.getByText("You can change these any time in Settings.")).toBeTruthy();
  // Drawing the page reads each state once and asks for nothing.
  expect(m(readPermission).mock.calls.map((c) => c[0])).toEqual(["photos", "microphone", "camera", "notifications"]);
  expect(askPermission).not.toHaveBeenCalled();
});

test("before the phone has answered, a row offers nothing", async () => {
  const wait = deferred<PermissionState>();
  m(readPermission).mockReturnValue(wait.promise);
  await render(<PermissionRows play />);
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  expect(screen.queryByText("Allowed")).toBeNull();
  await act(async () => { wait.resolve("notAsked"); });
  expect(screen.getAllByText("Allow")).toHaveLength(4);
});

describe("not asked", () => {
  test.each([["photos", "Allow photos and videos"], ["microphone", "Allow microphone"], ["camera", "Allow camera"], ["notifications", "Allow notifications"]] as const)(
    "%s: 'Allow' asks for exactly that one, once, and the row then shows what the phone says", async (id, label) => {
      await render(<PermissionRows play />);
      expect(within(row(id)).getByText("Allow")).toBeTruthy();
      await fireEvent.press(button(label));
      expect(askPermission).toHaveBeenCalledTimes(1);
      expect(askPermission).toHaveBeenCalledWith(id);
      expect(within(row(id)).getByText("Allowed")).toBeTruthy();
      expect(within(row(id)).queryByText("Allow")).toBeNull();
      // The others were not asked and still offer it.
      expect(screen.getAllByText("Allow")).toHaveLength(3);
      // And every state was read again afterwards.
      expect(m(readPermission).mock.calls.length).toBe(8);
    });

  test("refused in Apple's alert: the row becomes Open Settings — there is no second question", async () => {
    m(askPermission).mockImplementation(async (id: PermissionId) => (phone[id] = "denied"));
    await render(<PermissionRows play />);
    await fireEvent.press(button("Allow microphone"));
    expect(within(row("microphone")).getByText("Open Settings")).toBeTruthy();
    expect(within(row("microphone")).queryByText("Allow")).toBeNull();
    expect(askPermission).toHaveBeenCalledTimes(1);
  });

  test("one question at a time: while Apple's alert is up, a tap on another row asks nothing", async () => {
    const alert = deferred<PermissionState>();
    m(askPermission).mockReturnValueOnce(alert.promise);
    await render(<PermissionRows play />);
    await fireEvent.press(button("Allow photos and videos"));
    await fireEvent.press(button("Allow microphone"));
    await fireEvent.press(button("Allow photos and videos"));
    expect(askPermission).toHaveBeenCalledTimes(1);
    phone.photos = "granted";
    await act(async () => { alert.resolve("granted"); });
    await fireEvent.press(button("Allow microphone"));
    expect(askPermission).toHaveBeenCalledTimes(2);
    expect(askPermission).toHaveBeenLastCalledWith("microphone");
  });
});

test("allowed: a check and 'Allowed', and nothing to press", async () => {
  phone = { photos: "granted", microphone: "granted", camera: "granted", notifications: "granted" };
  await render(<PermissionRows play />);
  expect(screen.getAllByText("Allowed")).toHaveLength(4);
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});

test("limited (Photos): 'Limited' and Manage, which opens the system's picker and reads the state again — never a request", async () => {
  phone.photos = "limited";
  await render(<PermissionRows play />);
  expect(within(row("photos")).getByText("Limited")).toBeTruthy();
  const reads = m(readPermission).mock.calls.length;
  phone.photos = "granted";                            // full access chosen in the picker
  await fireEvent.press(button("Manage which photos Clipy can use"));
  expect(managePhotos).toHaveBeenCalledTimes(1);
  expect(askPermission).not.toHaveBeenCalled();
  expect(m(readPermission).mock.calls.length).toBe(reads + 4);
  expect(within(row("photos")).getByText("Allowed")).toBeTruthy();
});

test("denied: Open Settings opens the app's page in Settings and NO request is made", async () => {
  phone = { photos: "denied", microphone: "denied", camera: "denied", notifications: "denied" };
  await render(<PermissionRows play />);
  expect(screen.getAllByText("Open Settings")).toHaveLength(4);
  expect(screen.queryByText("Allow")).toBeNull();
  for (const label of ["Open Settings to allow photos and videos", "Open Settings to allow microphone", "Open Settings to allow camera", "Open Settings to allow notifications"]) await fireEvent.press(button(label));
  expect(openSettings).toHaveBeenCalledTimes(4);
  expect(askPermission).not.toHaveBeenCalled();
});

test("unavailable: the row is shown, dimmed, says 'Not available' and has no action", async () => {
  phone.camera = "unavailable"; phone.notifications = "unavailable";
  await render(<PermissionRows play />);
  for (const id of ["camera", "notifications"] as const) {
    expect(row(id)).toHaveStyle({ opacity: DISABLED_OPACITY });
    expect(within(row(id)).getByText("Not available")).toBeTruthy();
    expect(within(row(id)).queryAllByRole("button")).toHaveLength(0);
  }
  expect(row("photos")).toHaveStyle({ opacity: 1, minHeight: theme.size.listRow });
  expect(screen.getAllByText("Allow")).toHaveLength(2);
});

test("back from Settings: every state is read again and the rows follow; going to the background reads nothing", async () => {
  phone.photos = "denied";
  await render(<PermissionRows play />);
  expect(within(row("photos")).getByText("Open Settings")).toBeTruthy();
  const reads = m(readPermission).mock.calls.length;
  await act(async () => { for (const l of listeners) l("background"); });
  expect(m(readPermission).mock.calls.length).toBe(reads);
  phone.photos = "granted"; phone.camera = "denied";    // changed in Settings
  await comeBack();
  expect(m(readPermission).mock.calls.length).toBe(reads + 4);
  expect(within(row("photos")).getByText("Allowed")).toBeTruthy();
  expect(within(row("camera")).getByText("Open Settings")).toBeTruthy();
  expect(askPermission).not.toHaveBeenCalled();
});

test("leaving the page stops listening", async () => {
  const v = await render(<PermissionRows play />);
  expect(listeners).toHaveLength(1);
  await v.unmount();
  expect(listeners).toHaveLength(0);
});
