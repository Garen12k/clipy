import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";

/** The ONLY file that asks the phone for a project file or shows the share sheet for one. */
export const filePhone = {
  /**
   * Apple's file picker, any file (a .clipy has no registered type: it is known by its bytes). iOS hands the app a temporary COPY;
   * its uri, or null when the picker was closed (this call reports every failure as closed).
   */
  async pick(): Promise<string | null> {
    const picked = await File.pickFileAsync();
    return picked.canceled ? null : picked.result.uri;
  },
  /** Apple's share sheet for one file; resolves when the sheet has closed, whatever was chosen. iOS types the file by its extension. */
  async share(uri: string): Promise<void> { await Sharing.shareAsync(uri); },
  /** Removes the picker's temporary copy. Never throws. */
  async forget(uri: string): Promise<void> { try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* the system clears its own temporary folder */ } },
};
