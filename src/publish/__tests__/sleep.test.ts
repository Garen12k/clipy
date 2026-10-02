import { sleep } from "../usePost";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("resolves after the time and leaves no timer", async () => {
  const ac = new AbortController();
  let done = false;
  const p = sleep(1000, ac.signal).then(() => { done = true; });
  await jest.advanceTimersByTimeAsync(999);
  expect(done).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  await p;
  expect(done).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test("resolves at once on abort and clears its timer", async () => {
  const ac = new AbortController();
  const p = sleep(60000, ac.signal);
  ac.abort();
  await p;
  expect(jest.getTimerCount()).toBe(0);
});

test("an already-aborted signal resolves immediately without a timer", async () => {
  const ac = new AbortController(); ac.abort();
  await sleep(60000, ac.signal);
  expect(jest.getTimerCount()).toBe(0);
});
