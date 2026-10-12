import { render, screen } from "@testing-library/react-native";
jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: (cb: () => void) => { require("react").useEffect(() => { cb(); }, []); } }));
jest.mock("@/src/publish/useSession", () => ({ useSession: jest.fn() }));
import { ProjectCard } from "@/src/projects/ProjectCard";
import { SignInCard } from "@/src/publish/components/SignInCard";
import { useSession } from "@/src/publish/useSession";
import { theme } from "@/src/theme/theme";
import { textSize, unruled } from "@/src/ui/testing/textSize";

const AX5 = 3.571, S = theme.textScale.screen, R = theme.textScale.reading;
const summary = { id: "p1", name: "Beach day", durationSec: 21, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [] as ("youtube" | "tiktok")[], coverTitle: "Summer" };
afterEach(() => textSize(1));

test("a project card: what is on the picture never scales; the name under it is capped and fits back on its one line", async () => {
  await textSize(AX5);
  await render(<ProjectCard summary={summary} onPress={jest.fn()} onLongPress={jest.fn()} onMore={jest.fn()} />);
  expect(unruled()).toEqual([]);
  expect(screen.getByTestId("project-cover-title").props.allowFontScaling).toBe(false);
  expect(screen.getByText("0:21").props.allowFontScaling).toBe(false);
  const name = screen.getByText("Beach day");
  expect(name.props).toMatchObject({ maxFontSizeMultiplier: S, numberOfLines: 1, adjustsFontSizeToFit: true });
  expect(name.props.minimumFontScale).toBeCloseTo(1 / S, 6);
});

test("a paragraph under a title on a scrolling page grows further than its title; the button is a control", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "signedOut" });
  await textSize(AX5);
  await render(<SignInCard />);
  expect(unruled()).toEqual([]);
  expect(screen.getByText("Sign in to Clipy").props.maxFontSizeMultiplier).toBe(S);
  expect(screen.getByText("Clipy keeps your connected accounts safe on its server.").props.maxFontSizeMultiplier).toBe(R);
  expect(screen.getByText("Sign In").props).toMatchObject({ maxFontSizeMultiplier: S, numberOfLines: 1, adjustsFontSizeToFit: true });
  // Still smaller than the title above it: 15 × 1.65 < 20 × 1.35.
  expect(theme.type.body * R).toBeLessThan(theme.type.heading * S);
});

test("the reading sizes never pass the title they stand under (spec D6)", () => {
  expect(theme.type.input * R).toBeLessThan(theme.text.title1.size * S);        // a wizard page's line under its title; the sign-in tagline
  expect(theme.type.body * R).toBeLessThan(theme.type.title * S);              // the note under "Sign in with email"
  expect(theme.type.body * R).toBeLessThan(theme.type.heading * S);            // the Export and sign-in cards
});
