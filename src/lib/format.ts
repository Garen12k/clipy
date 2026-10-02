export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function formatDurationPrecise(sec: number): string {
  const tenths = Math.round(Math.max(0, sec) * 10);
  const whole = Math.floor(tenths / 10);
  return `${formatDuration(whole)}.${tenths % 10}`;
}
export function formatSpeed(s: number): string {
  return `${Number(s.toFixed(2))}×`;
}
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
/** Home-card line: calendar-day based, in the device's local time. */
export function editedLabel(iso: string, now: Date = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.max(0, Math.round((day(now) - day(new Date(iso))) / 86400000));
  return days === 0 ? "Edited today" : days === 1 ? "Yesterday" : `${days} days ago`;
}
