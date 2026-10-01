import { formatDuration, formatDurationPrecise, formatSpeed, relativeTime } from "../format";

test("formatDuration", () => {
  expect(formatDuration(0)).toBe("0:00");
  expect(formatDuration(65.4)).toBe("1:05");
  expect(formatDuration(600)).toBe("10:00");
});
test("formatDurationPrecise shows tenths", () => {
  expect(formatDurationPrecise(65.46)).toBe("1:05.5");
});
test("formatSpeed trims trailing zeros", () => {
  expect(formatSpeed(2)).toBe("2×");
  expect(formatSpeed(1.5)).toBe("1.5×");
  expect(formatSpeed(0.25)).toBe("0.25×");
});
test("relativeTime", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  expect(relativeTime("2026-10-01T11:59:40Z", now)).toBe("just now");
  expect(relativeTime("2026-10-01T11:30:00Z", now)).toBe("30m ago");
  expect(relativeTime("2026-10-01T09:00:00Z", now)).toBe("3h ago");
  expect(relativeTime("2026-09-28T09:00:00Z", now)).toBe("3d ago");
});
