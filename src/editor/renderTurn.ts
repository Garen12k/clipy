/** What the turn needs of a render: whether it was cancelled, and where a cancel reaches it (`giveUp`, called by the render's own `cancel`). */
export interface TurnEntry { cancelled: boolean; giveUp: (() => void) | null }

/** Settles when the native call before this one is over (it only ever resolves): the turn is free when it has. */
let turn: Promise<void> = Promise.resolve();

/**
 * One heavy native render at a time, whoever asks and whatever it makes (a cut-out copy, a steadied or smoothed copy; the editor's
 * queues, the export): the phone runs one at a time anyway and a second call would WAIT there, with its deadline already running.
 * So `run` (the native call with its deadline) starts only when the call before it is over. A call that is cancelled while it
 * waits answers AT ONCE with `cancelledError()` — its own kind's cancel — and never reaches the phone. The turn is always given
 * on: `run` must always settle, a call that throws counts as over, and a call that was cancelled while waiting passes the turn on
 * the moment it gets it.
 */
export function takeTurn(entry: TurnEntry, run: () => Promise<void>, cancelledError: () => Error): Promise<void> {
  const before = turn;
  let over: () => void = () => {};
  turn = new Promise<void>((resolve) => { over = resolve; });
  return new Promise<void>((resolve, reject) => {
    let waiting = true;
    entry.giveUp = () => {
      if (!waiting) return;
      waiting = false;
      reject(cancelledError());
    };
    void before.then(() => {
      if (!waiting || entry.cancelled) {   // cancelled while it waited: nothing was started
        if (waiting) { waiting = false; reject(cancelledError()); }
        over();
        return;
      }
      waiting = false;
      entry.giveUp = null;
      let running: Promise<void>;
      try { running = run(); } catch (e) { reject(e); over(); return; }
      running.then(resolve, reject).then(over, over);
    });
  });
}
