import { takeTurn, type TurnEntry } from "../renderTurn";

const entry = (): TurnEntry => ({ cancelled: false, giveUp: null });
const tick = async (n = 20) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const stopped = (kind: string) => () => Object.assign(new Error(`${kind} cancelled`), { code: kind });
/** A run that stays open until the test ends it. */
function open() {
  let end!: () => void, fail!: (e: unknown) => void;
  const started = jest.fn(() => new Promise<void>((res, rej) => { end = res; fail = rej; }));
  return { started, end: () => end(), fail: (e: unknown) => fail(e) };
}

test("one at a time, whoever asks: the second run starts only when the first is over", async () => {
  const a = open(), b = open();
  const first = takeTurn(entry(), a.started, stopped("cutout"));
  const second = takeTurn(entry(), b.started, stopped("steady"));
  await tick();
  expect(a.started).toHaveBeenCalledTimes(1);
  expect(b.started).not.toHaveBeenCalled();
  a.end();
  await first;
  await tick();
  expect(b.started).toHaveBeenCalledTimes(1);
  b.end();
  await second;
});

test("cancelled while it waits: it answers at once with ITS OWN error, never runs, and passes the turn on", async () => {
  const a = open(), b = open(), c = open();
  const first = takeTurn(entry(), a.started, stopped("cutout"));
  const waiting = entry();
  const second = takeTurn(waiting, b.started, stopped("steady"));
  const third = takeTurn(entry(), c.started, stopped("cutout"));
  await tick();
  waiting.cancelled = true;
  waiting.giveUp?.();
  await expect(second).rejects.toMatchObject({ code: "steady" });
  a.end();
  await first;
  await tick();
  expect(b.started).not.toHaveBeenCalled();
  expect(c.started).toHaveBeenCalledTimes(1);
  c.end();
  await third;
});

test("a run that fails, and one that throws before it returns, still give the turn on", async () => {
  const a = open(), c = open();
  const first = takeTurn(entry(), a.started, stopped("x"));
  const thrower = takeTurn(entry(), () => { throw new Error("boom"); }, stopped("x"));
  const last = takeTurn(entry(), c.started, stopped("x"));
  await tick();
  a.fail(new Error("first failed"));
  await expect(first).rejects.toThrow("first failed");
  await expect(thrower).rejects.toThrow("boom");
  await tick();
  expect(c.started).toHaveBeenCalledTimes(1);
  c.end();
  await last;
});

test("while its run is going, the entry's giveUp belongs to the run (the turn has let go of it)", async () => {
  const a = open();
  const e = entry();
  const first = takeTurn(e, a.started, stopped("x"));
  await tick();
  expect(e.giveUp).toBeNull();
  a.end();
  await first;
});
