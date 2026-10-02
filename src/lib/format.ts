export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function formatSpeed(s: number): string {
  return `${Number(s.toFixed(2))}×`;
}
/** Home-card line: calendar-day based, in the device's local time. */
export function editedLabel(iso: string, now: Date = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.max(0, Math.round((day(now) - day(new Date(iso))) / 86400000));
  return days === 0 ? "Edited today" : days === 1 ? "Yesterday" : `${days} days ago`;
}
