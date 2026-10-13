import { File, FileMode } from "expo-file-system";

export interface ChunkWriter { write(bytes: Uint8Array): void; close(): void }

/**
 * Writes bytes straight to disk, one chunk after another — the reader's sibling (src/publish/fileReader.ts). The file is made
 * first (a write handle opens only a file that exists) and emptied. Hand `write` whole arrays, never a `subarray` view.
 */
export function openWriter(uri: string): ChunkWriter {
  const file = new File(uri);
  const parent = file.parentDirectory;
  if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
  file.create({ intermediates: true, overwrite: true });
  const handle = file.open(FileMode.Truncate);
  return {
    write(bytes) { handle.writeBytes(bytes); },
    close() { try { handle.close(); } catch { /* already closed */ } },
  };
}
