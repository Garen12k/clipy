import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../useSession", () => ({ useSession: jest.fn() }));
import { router } from "expo-router";
import * as Apple from "expo-apple-authentication";
import { SignInCard } from "../components/SignInCard";
import { useSession } from "../useSession";

beforeEach(() => { jest.clearAllMocks(); });

test("unconfigured backend explains itself, keeps the Share hint, and its button opens the sign-in page (a preview)", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "unconfigured" });
  await render(<SignInCard />);
  expect(screen.getByText("Sign-in isn't set up yet")).toBeTruthy();
  expect(screen.getByText(/You can still share with the Share button\./)).toBeTruthy();
  expect(screen.queryByText(/Posting isn't set up yet/)).toBeNull();
  expect(screen.queryAllByTestId("primary-button")).toHaveLength(0);
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  expect(router.push).toHaveBeenCalledWith("/welcome");
});

test("signed out: the short text and ONE button, 'Sign in', which opens the welcome screen — the card hosts no Apple button", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "signedOut" });
  await render(<SignInCard />);
  expect(screen.getByText("Sign in to Clipy")).toBeTruthy();
  expect(screen.getByText("Clipy keeps your connected accounts safe on its server.")).toBeTruthy();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.queryByLabelText("Sign in with Apple")).toBeNull();
  expect(Apple.isAvailableAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith("/welcome");
});

test("signed in or loading renders nothing", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "signedIn", email: "a@b.c" });
  const v = await render(<SignInCard />);
  expect(v.toJSON()).toBeNull();
  (useSession as jest.Mock).mockReturnValue({ status: "loading" });
  await v.rerender(<SignInCard />);
  expect(v.toJSON()).toBeNull();
});
