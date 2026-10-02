import { File, UploadType } from "expo-file-system";

export interface WholeFileResult { status: number; body: string }

const abortError = () => { const e = new Error("The operation was aborted."); e.name = "AbortError"; return e; };

/**
 * Streams the file as the raw request body (never loads it into JS memory). Rejects with an Error named "AbortError" when the signal aborts.
 * Resolves for any HTTP status. The only place that touches the native upload API (expo-file-system `File.upload`, a URLSession upload task).
 *
 * Redirects: expo-file-system's URLSession delegate does not implement `willPerformHTTPRedirection`, so iOS follows any redirect itself,
 * carrying the request headers along, and the result does not say which address answered. A 3xx therefore never reaches us unless it had
 * no Location; callers must only pass headers meant for the exact host they checked (see `uploadMetaWhole`).
 */
export async function postWholeFile(url: string, fileUri: string, headers: Record<string, string>, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<WholeFileResult> {
  if (signal.aborted) throw abortError();
  try {
    const res = await new File(fileUri).upload(url, {
      httpMethod: "POST",
      uploadType: UploadType.BINARY_CONTENT,
      headers: { ...headers },
      // Foreground: the post goes on to finalize and poll in JS straight after, which needs the app open anyway.
      sessionType: "foreground",
      signal,
      onProgress: ({ bytesSent, totalBytes }) => { if (totalBytes > 0) onProgress(Math.min(1, bytesSent / totalBytes)); },
    });
    return { status: res.status, body: res.body };
  } catch (e) {
    if (signal.aborted) throw abortError();
    throw e;
  }
}
