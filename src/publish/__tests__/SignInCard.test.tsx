import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("../useSession", () => ({ useSession: jest.fn() }));
jest.mock("../supabase", () => ({ signInWithApple: jest.fn() }));
import { SignInCard } from "../components/SignInCard";
import { signInWithApple } from "../supabase";
import { useSession } from "../useSession";
import { useToast } from "@/src/ui/Toast";

beforeEach(() => { jest.clearAllMocks(); useToast.getState().clear(); });

test("unconfigured backend explains itself and offers no sign-in", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "unconfigured" });
  await render(<SignInCard />);
  expect(screen.getByText("Posting isn't set up yet")).toBeTruthy();
  expect(screen.queryByLabelText("Sign in with Apple")).toBeNull();
});

test("signed out shows Sign in with Apple; errors are toasted; cancel is silent", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "signedOut" });
  await render(<SignInCard />);
  (signInWithApple as jest.Mock).mockResolvedValueOnce("cancelled");
  await fireEvent.press(screen.getByLabelText("Sign in with Apple"));
  expect(useToast.getState().message).toBeNull();
  (signInWithApple as jest.Mock).mockRejectedValueOnce(new Error("Unacceptable audience in id_token"));
  await fireEvent.press(screen.getByLabelText("Sign in with Apple"));
  await waitFor(() => expect(useToast.getState().message).toBe("Unacceptable audience in id_token"));
});

test("no Apple button when Sign in with Apple isn't available", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "signedOut" });
  (require("expo-apple-authentication").isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
  await render(<SignInCard />);
  expect(await screen.findByText("Sign in with Apple isn't available on this device.")).toBeTruthy();
  expect(screen.queryByLabelText("Sign in with Apple")).toBeNull();
});

test("signed in or loading renders nothing", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "signedIn", email: "a@b.c" });
  const v = await render(<SignInCard />);
  expect(v.toJSON()).toBeNull();
});
