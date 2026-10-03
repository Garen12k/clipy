import { createScrubController } from "../timelineScroll";

const PPS = 60;
function setup() {
  const deps = { scrollTo: jest.fn(), seek: jest.fn(), pause: jest.fn() };
  return { deps, c: createScrubController(deps) };
}

test("dragging scrubs the playhead and letting go keeps the position (no scroll back)", () => {
  const { deps, c } = setup();
  c.onBeginDrag();
  expect(deps.pause).toHaveBeenCalledTimes(1);
  c.onScroll(120, PPS);
  c.onScroll(247, PPS);
  c.onEnd(247, PPS);
  expect(deps.seek.mock.calls.map((x) => x[0])).toEqual([2, 247 / 60, 247 / 60]);
  expect(deps.scrollTo).not.toHaveBeenCalled();
  // The playhead the drag produced must not make the strip jump when the follow effect runs.
  c.follow(247 / 60, PPS);
  expect(deps.scrollTo).not.toHaveBeenCalled();
});

test("a scroll-end event that was not a user scroll is ignored", () => {
  const { deps, c } = setup();
  c.onEnd(300, PPS);
  expect(deps.seek).not.toHaveBeenCalled();
  expect(deps.scrollTo).not.toHaveBeenCalled();
});

test("iOS reports a programmatic scrollTo as a finished scroll: that must not loop", () => {
  const deps = { scrollTo: jest.fn(), seek: jest.fn(), pause: jest.fn() };
  const c = createScrubController(deps);
  // Simulate the device: every scrollTo synchronously fires scroll + momentum-end events.
  deps.scrollTo.mockImplementation((x: number) => { c.onScroll(x, PPS); c.onEnd(x, PPS); });
  c.follow(4.12, PPS);
  c.follow(4.12, PPS);
  expect(deps.scrollTo).toHaveBeenCalledTimes(1);
  expect(deps.scrollTo).toHaveBeenCalledWith(4.12 * 60);
  expect(deps.seek).not.toHaveBeenCalled();
});

test("playback moves the strip; those scroll events do not seek", () => {
  const { deps, c } = setup();
  c.follow(1, PPS);
  c.onScroll(60, PPS);
  c.follow(1.5, PPS);
  expect(deps.scrollTo.mock.calls.map((x) => x[0])).toEqual([60, 90]);
  expect(deps.seek).not.toHaveBeenCalled();
});

test("momentum after the finger lifts keeps scrubbing until it stops", () => {
  const { deps, c } = setup();
  c.onBeginDrag();
  c.onScroll(100, PPS);
  c.onEnd(100, PPS);          // finger lifted
  c.onMomentumBegin();        // the strip keeps gliding
  c.onScroll(160, PPS);
  c.follow(160 / 60, PPS);    // the playhead changed: must not fight the glide
  c.onEnd(180, PPS);          // glide finished
  expect(deps.seek.mock.calls.map((x) => x[0])).toEqual([100 / 60, 100 / 60, 160 / 60, 3]);
  expect(deps.scrollTo).not.toHaveBeenCalled();
});

test("the strip does not follow the playhead while the user is scrolling", () => {
  const { deps, c } = setup();
  c.onBeginDrag();
  c.follow(9, PPS);
  expect(deps.scrollTo).not.toHaveBeenCalled();
});

test("zooming re-centres the strip on the playhead", () => {
  const { deps, c } = setup();
  c.follow(2, 60);
  c.follow(2, 120);
  expect(deps.scrollTo.mock.calls.map((x) => x[0])).toEqual([120, 240]);
});
