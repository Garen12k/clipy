export type Resolution = 720 | 1080 | 2160;
export const RESOLUTIONS: { value: Resolution; label: string }[] = [{ value: 720, label: "720p" }, { value: 1080, label: "1080p" }, { value: 2160, label: "4K" }];
export const BITRATE_MBPS: Record<Resolution, number> = { 720: 5, 1080: 10, 2160: 35 };

export const estimateBytes = (durationSec: number, res: Resolution): number => (durationSec * BITRATE_MBPS[res] * 1e6) / 8;
export const canExport4K = (clips: { width: number; height: number }[]): boolean => clips.some((c) => Math.max(c.width, c.height) >= 2160);
export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  return `${Math.round(n / 1e6)} MB`;
}
