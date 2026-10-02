import { editedLabel, formatDuration, formatSpeed } from "../format";

test("formatDuration", () => {
  expect(formatDuration(0)).toBe("0:00");
  expect(formatDuration(65.4)).toBe("1:05");
  expect(formatDuration(600)).toBe("10:00");
});
test("formatSpeed trims trailing zeros", () => {
  expect(formatSpeed(2)).toBe("2×");
  expect(formatSpeed(1.5)).toBe("1.5×");
  expect(formatSpeed(0.25)).toBe("0.25×");
});
test("editedLabel", () => {
  const now = new Date("2026-10-02T15:00:00");
  expect(editedLabel("2026-10-02T01:00:00", now)).toBe("Edited today");
  expect(editedLabel("2026-10-01T23:00:00", now)).toBe("Yesterday");
  expect(editedLabel("2026-09-29T12:00:00", now)).toBe("3 days ago");
});
