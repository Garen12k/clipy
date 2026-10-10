import { AppState, type AppStateStatus } from "react-native";
import { ACTIVE_STEP_MS, activeTimeout, whenActive } from "../activeTime";

const app = (now: AppStateStatus) => { Object.defineProperty(AppState, "currentState", { configurable: true, get: () => now }); };
beforeEach(() => { jest.useFakeTimers(); app("active"); });
afterEach(() => { jest.useRealTimers(); app("active"); });

test("in front it is a plain deadline: it fires at its time, once, and not a millisecond before", () => {
  const fire = jest.fn();
  activeTimeout(fire, 120000);
  jest.advanceTimersByTime(119999);
  expect(fire).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(fire).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(600000);
  expect(fire).toHaveBeenCalledTimes(1);
});

test("a deadline that is not a whole number of steps fires at its own time", () => {
  const fire = jest.fn();
  activeTimeout(fire, 2500);
  jest.advanceTimersByTime(2499);
  expect(fire).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(fire).toHaveBeenCalledTimes(1);
});

test("SUSPENDED time does not count: a timer that comes back long overdue has used one step, not the deadline", () => {
  const fire = jest.fn();
  activeTimeout(fire, 120000);
  jest.advanceTimersByTime(10000);                       // ten seconds in front
  // The app is suspended for an hour: nothing runs. On return the clock has jumped, and the one timer that was waiting is overdue.
  jest.setSystemTime(Date.now() + 3600000);
  jest.advanceTimersByTime(ACTIVE_STEP_MS);              // that one overdue step runs
  expect(fire).not.toHaveBeenCalled();                   // a plain setTimeout(…, 120000) would have fired here
  jest.advanceTimersByTime(108999);
  expect(fire).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);                           // 10 + 1 + 109 = the 120 seconds it was given
  expect(fire).toHaveBeenCalledTimes(1);
});

test("time in the background does not count while the app is alive there, and counting goes on from where it was", () => {
  const fire = jest.fn();
  activeTimeout(fire, 5000);
  jest.advanceTimersByTime(3000);
  app("background");
  jest.advanceTimersByTime(600000);
  expect(fire).not.toHaveBeenCalled();
  app("active");
  jest.advanceTimersByTime(1999);
  expect(fire).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(fire).toHaveBeenCalledTimes(1);
});

test("called off: it never fires, and calling it off twice or after it fired is harmless", () => {
  const fire = jest.fn();
  const stop = activeTimeout(fire, 3000);
  jest.advanceTimersByTime(2000);
  stop(); stop();
  jest.advanceTimersByTime(60000);
  expect(fire).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  const again = jest.fn();
  const stopAgain = activeTimeout(again, 1000);
  jest.advanceTimersByTime(1000);
  stopAgain();
  expect(again).toHaveBeenCalledTimes(1);
});

test("whenActive: at once in front; in the background at the next change to active, once; and it can be called off", () => {
  const now = jest.fn();
  whenActive(now);
  expect(now).toHaveBeenCalledTimes(1);

  app("background");
  let heard: ((s: AppStateStatus) => void) | null = null;
  const remove = jest.fn();
  const add = jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, cb: (s: AppStateStatus) => void) => { heard = cb; return { remove }; }) as never);
  const later = jest.fn();
  whenActive(later);
  expect(later).not.toHaveBeenCalled();
  heard!("inactive");
  expect(later).not.toHaveBeenCalled();
  heard!("active"); heard!("active");
  expect(later).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);

  const never = jest.fn();
  const off = whenActive(never);
  off(); off();
  heard!("active");
  expect(never).not.toHaveBeenCalled();
  add.mockRestore();
});
