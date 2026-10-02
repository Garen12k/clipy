import { File, FileMode } from "expo-file-system";

export interface ChunkReader { size: number; read(offset: number, length: number): Uint8Array; close(): void }

/** Reads byte ranges straight from disk. (File.slice and Blob bodies load the whole video into memory — never use them.) */
export function openReader(uri: string): ChunkReader {
  const file = new File(uri);
  const handle = file.open(FileMode.ReadOnly);
  return {
    size: file.size,
    read(offset, length) { handle.offset = offset; return handle.readBytes(length); },
    close() { try { handle.close(); } catch { /* already closed */ } },
  };
}
