import type { FsAdapter } from "./fs";
import { isSafeName } from "./projectFile";
import { STYLES, parseStyles, stylesText, type StyleDraft, type StyleMusic, type UserStyle } from "./userStyles";

// Where the owner's styles live (docs/superpowers/specs/2026-10-16-my-styles-design.md §6): <documents>/styles/styles.json and the
// own music in <documents>/styles/media/ — never under projects/, so no project sweep, list, pack or restore sees them. Every read
// and write is ONE turn of one chain, in the order asked (the phone's move is queued and removes the destination first).

export type StyleErrorCode = "full" | "newer" | "missing";
export class StyleStoreError extends Error {
  constructor(readonly code: StyleErrorCode) { super(`styles: ${code}`); this.name = "StyleStoreError"; }
}
export type StylesRead = { status: "ok"; styles: UserStyle[] } | { status: "newer" };
export interface StyleStoreDeps { newId(): string; nowIso(): string }

const cutName = (s: string) => Array.from(s.trim()).slice(0, STYLES.nameMax).join("");
/** A style's name as typed, trimmed and cut to `nameMax`; blank → the fallback; both blank → "My style". */
export function cleanName(name: string, fallback: string): string { return cutName(name) || cutName(fallback) || "My style"; }
const extOf = (uri: string, title: string) => ((/\.([A-Za-z0-9]+)$/.exec(uri) ?? /\.([A-Za-z0-9]+)$/.exec(title))?.[1] ?? "m4a").toLowerCase();

export function makeStyleStore(fs: FsAdapter, deps: StyleStoreDeps) {
  const dir = `${fs.documentDir}styles`;
  const file = `${dir}/styles.json`;
  const tmp = `${file}.tmp`;
  const media = `${dir}/media`;
  const musicPath = (name: string) => `${media}/${name}`;
  let chain: Promise<void> = Promise.resolve();
  let swept = false;

  /** One turn: starts when every turn asked before it has ended; a failure rejects for its caller only. Never ask for a turn inside one. */
  function inTurn<T>(work: () => Promise<T>): Promise<T> {
    const run = chain.then(work);
    chain = run.then(() => {}, () => {});
    return run;
  }
  /** The first good read of a launch removes music no style names. */
  async function sweep(styles: UserStyle[]): Promise<StylesRead> {
    if (!swept) {
      swept = true;
      const named = new Set(styles.flatMap((s) => (s.music?.kind === "own" ? [s.music.file] : [])));
      for (const name of await fs.list(media)) if (!named.has(name)) await fs.remove(musicPath(name)).catch(() => {});
    }
    return { status: "ok", styles };
  }
  async function readNow(): Promise<StylesRead> {
    if (await fs.exists(file)) {
      const read = parseStyles(await fs.readText(file));
      if (read.status === "newer") { swept = true; return read; }   // no sweep this launch: the music may be named by what we cannot read
      if (read.status === "ok") return sweep(read.styles);
      swept = true;
      await fs.move(file, `${dir}/damaged-${deps.nowIso().replace(/\D/g, "")}.json`);   // kept, never read again, never deleted
      console.warn("styles: the file could not be read; it was kept aside");
      return { status: "ok", styles: [] };
    }
    if (await fs.exists(tmp)) {
      const read = parseStyles(await fs.readText(tmp));
      if (read.status === "ok") { await fs.move(tmp, file); return sweep(read.styles); }
      swept = true;
      if (read.status === "newer") return read;   // a later Clipy's cut-off write: kept as it is, and nothing written over it
      return { status: "ok", styles: [] };   // a cut-off write: left where it is, the next write replaces it
    }
    return sweep([]);
  }
  async function stylesToWrite(): Promise<UserStyle[]> {
    const read = await readNow();
    if (read.status === "newer") throw new StyleStoreError("newer");
    return read.styles;
  }
  async function write(styles: UserStyle[]): Promise<void> {
    await fs.mkdir(dir);
    await fs.writeText(tmp, stylesText(styles));
    await fs.move(tmp, file);
  }

  /**
   * After a write that failed. The phone's move removes the destination first, so the old file may be gone with only the tmp
   * (the NEW list) left: then the tmp is all there is and it stays, with the copied music it names — unless there were no
   * styles before, when removing both is exactly the old state. With the old file still there, the tmp is never read
   * (a tmp counts only without styles.json) and the copy is taken back.
   */
  async function unwind(wasEmpty: boolean, copied: string | null): Promise<void> {
    const oldThere = await fs.exists(file).catch(() => true);
    if (!oldThere && !wasEmpty) return;
    if (!oldThere) await fs.remove(tmp).catch(() => {});
    if (copied) await fs.remove(copied).catch(() => {});
  }

  return {
    list: (): Promise<StylesRead> => inTurn(readNow),
    add: (draft: StyleDraft, name: string, fallbackName: string): Promise<UserStyle> => inTurn(async () => {
      const styles = await stylesToWrite();
      if (styles.length >= STYLES.max) throw new StyleStoreError("full");
      const id = deps.newId();
      const { music: from, ...look } = draft;
      let music: StyleMusic | null = from?.kind === "bundled" ? { kind: "bundled", trackId: from.trackId } : null;
      let copied: string | null = null;
      if (from?.kind === "own") {
        if (!(await fs.exists(from.sourceUri))) throw new StyleStoreError("missing");
        const fileName = `${id}.${extOf(from.sourceUri, from.title)}`;
        await fs.mkdir(media);
        copied = musicPath(fileName);
        try { await fs.copy(from.sourceUri, copied); }
        catch (e) { await fs.remove(copied).catch(() => {}); throw e; }
        music = { kind: "own", file: fileName, title: from.title, durationSec: from.durationSec, beats: [...from.beats] };
      }
      const style: UserStyle = { id, name: cleanName(name, fallbackName), createdAt: deps.nowIso(), ...look, music };
      try { await write([style, ...styles]); }
      catch (e) { await unwind(styles.length === 0, copied); throw e; }
      return style;
    }),
    rename: (id: string, name: string): Promise<void> => inTurn(async () => {
      const styles = await stylesToWrite();
      if (!styles.some((s) => s.id === id)) return;
      await write(styles.map((s) => (s.id === id ? { ...s, name: cleanName(name, s.name) } : s)));
    }),
    remove: (id: string): Promise<void> => inTurn(async () => {
      const styles = await stylesToWrite();
      const gone = styles.find((s) => s.id === id);
      if (!gone) return;
      const left = styles.filter((s) => s.id !== id);
      await write(left);
      const m = gone.music;
      if (m?.kind === "own" && !left.some((s) => s.music?.kind === "own" && s.music.file === m.file)) await fs.remove(musicPath(m.file)).catch(() => {});
    }),
    musicUri: (style: UserStyle): Promise<string | null> => inTurn(async () => {
      const m = style.music;
      if (m?.kind !== "own" || !isSafeName(m.file)) return null;
      return (await fs.exists(musicPath(m.file))) ? musicPath(m.file) : null;
    }),
  };
}
export type StyleStore = ReturnType<typeof makeStyleStore>;
