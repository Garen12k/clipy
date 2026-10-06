import { hasSeenWelcome, markWelcomeSeen, WELCOME_SEEN_KEY } from "../welcomeSeen";

type Store = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void };
const g = globalThis as unknown as { localStorage: Store };
const real = g.localStorage;
afterEach(() => { g.localStorage = real; real.removeItem(WELCOME_SEEN_KEY); });

test("not seen at first; seen once marked, and it is stored under the one key", () => {
  expect(hasSeenWelcome()).toBe(false);
  markWelcomeSeen();
  expect(hasSeenWelcome()).toBe(true);
  expect(real.getItem(WELCOME_SEEN_KEY)).toBe("1");
  expect(WELCOME_SEEN_KEY).toBe("clipy.welcomeSeen");
});

test("storage that throws counts as seen, and marking never throws: nobody is held on the welcome screen", () => {
  g.localStorage = { getItem: () => { throw new Error("disk"); }, setItem: () => { throw new Error("disk"); }, removeItem: () => {} };
  expect(hasSeenWelcome()).toBe(true);
  expect(() => markWelcomeSeen()).not.toThrow();
});

test("no storage at all counts as seen", () => {
  (g as { localStorage?: Store }).localStorage = undefined as never;
  expect(hasSeenWelcome()).toBe(true);
  expect(() => markWelcomeSeen()).not.toThrow();
});
