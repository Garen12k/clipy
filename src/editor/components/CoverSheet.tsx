import { requestPermissionsAsync, saveToLibraryAsync } from "expo-media-library/legacy";
import { useEffect, useRef, useState } from "react";
import { PixelRatio, useWindowDimensions, View } from "react-native";
import { frameUriAt } from "@/src/editor/coverFrame";
import { setCover } from "@/src/editor/model/ops";
import { coverTimeOf, frameAt, totalDuration } from "@/src/editor/model/timeline";
import { COVER_LIMITS, frameAspect, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Field } from "@/src/ui/Field";
import { useKeyboard } from "@/src/ui/keyboard";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Slider } from "@/src/ui/Slider";
import { Body } from "@/src/ui/Text";
import { ToolPanel } from "@/src/ui/ToolPanel";
import { CoverFrame } from "./CoverFrame";

/** The frame's height in the panel. It never changes: this view is the picture Save to Photos captures. */
const FRAME_HEIGHT = 240;
/** The shorter side, in pixels, of the picture saved to Photos; the other side follows the project's aspect ratio (a wide cover is 1080 high, not 1080 wide). */
const SAVE_SHORT_SIDE = 1080;
/** The saved picture's size in pixels for a frame of this shape (width / height). */
export const coverSaveSize = (ratio: number): { width: number; height: number } =>
  (ratio > 1 ? { width: Math.round(SAVE_SHORT_SIDE * ratio), height: SAVE_SHORT_SIDE } : { width: SAVE_SHORT_SIDE, height: Math.round(SAVE_SHORT_SIDE / ratio) });
/** The project with this cover. The first frame without a title is no cover at all (what a project without a cover already shows). */
const withCover = (p: Project, time: number, title: string): Project => setCover(p, time === 0 && title.trim() === "" ? null : { time, title });
/** What the frame shows, as one string: the panel loads a picture only when this changes (a drag, an undo, a clip trimmed under the cover). */
const frameKey = (p: Project | null): string => {
  const f = p ? frameAt(p, coverTimeOf(p)) : null;
  return f ? `${f.clip.id}|${f.clip.sourceUri}|${f.sourceTime}` : "";
};

/**
 * Picks the frame that stands for the video and a short title over it — an inline panel: the video stays in view above it.
 * Like every other tool it writes as it goes: one drag of the slider is one undo step, an unbroken run of typing is one, Reset is
 * one back to no cover. Opening and closing write nothing, and the white line is never moved (the panel shows the chosen frame itself,
 * with the title on it — that view is also the picture Save to Photos captures).
 */
export function CoverSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const hasClips = useEditorStore((s) => (s.project?.clips.length ?? 0) > 0);
  // The stored cover, read clamped; primitives, so the panel re-renders only when one of them changes. The panel is mounted while
  // closed and the store changes on every tick of the playhead: closed, each of these is a constant and walks no clips.
  const time = useEditorStore((s) => (visible && s.project ? coverTimeOf(s.project) : 0));
  const stored = useEditorStore((s) => s.project?.cover?.title ?? "");
  const total = useEditorStore((s) => (visible && s.project ? totalDuration(s.project) : 0));
  const ratio = useEditorStore((s) => (visible && s.project ? frameAspect(s.project) : 1));
  const shown = useEditorStore((s) => (visible ? frameKey(s.project) : ""));
  const { width: windowW } = useWindowDimensions();
  /** The keyboard is up: the panel is short, without its slider, and the frame scrolled out of the way, so it is not saved now. */
  const typing = useKeyboard((s) => s.height > 0);
  // The field's own text (the cover holds it trimmed, the field must keep a space just typed), and the stored title it stands for:
  // once the stored title is another one (Undo, Redo, Reset), the field shows that instead.
  const [draft, setDraft] = useState<{ text: string; stored: string } | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [note, setNote] = useState("");
  /** A save is running: the ref stops a second press at once, the state shows the button disabled. */
  const [saving, setSaving] = useState(false);
  const frameRef = useRef<View>(null);
  const busy = useRef(false);
  /** The slider is held: its values are one undo step, and the frame is the quick thumbnail until it is let go. */
  const dragging = useRef(false);
  /** The project as the last keystroke of the open typing step left it (see `type`). */
  const typed = useRef<Project | null>(null);
  // Only the newest frame request may show: a slow thumbnail must not replace the still asked for after it.
  const request = useRef(0);

  const load = (exact: boolean) => {
    const p = useEditorStore.getState().project;
    if (!p) return;
    const mine = ++request.current;
    void frameUriAt(p, coverTimeOf(p), exact).then((next) => { if (mine === request.current) setUri(next); });
  };

  // Each opening starts clean: no note, the field on the stored title, and not the frame of the last opening while this one's loads.
  useEffect(() => {
    if (!visible) return;
    setDraft(null); setNote(""); setUri(null);
    dragging.current = false; typed.current = null;
    return () => { request.current++; };
  }, [visible]);
  // The frame follows the cover, whoever changed it. The exact still unless the slider is held: the frame may be saved to Photos
  // without the slider being touched.
  useEffect(() => {
    if (visible && shown) load(!dragging.current);
  }, [visible, shown]);

  if (!hasClips) return null;

  const title = draft && draft.stored === stored ? draft.text : stored;
  const scale = Math.min(1, (windowW - theme.space.xl * 2) / (FRAME_HEIGHT * ratio));
  const slide = (v: number) => {
    const s = useEditorStore.getState();
    // A value without a drag (VoiceOver moves the slider in steps) is a step of its own.
    if (dragging.current) s.applyTransient((p) => withCover(p, v, p.cover?.title ?? ""));
    else s.apply((p) => withCover(p, v, p.cover?.title ?? ""));
  };
  // An unbroken run of keystrokes is one undo step, begun by its first keystroke that changes the cover (as in the Text panel): a
  // keystroke continues the open step only while the project is still the object the last one left and Redo is not armed.
  const type = (raw: string) => {
    // Cut by whole characters (code points): `maxLength` counts UTF-16 units and can split an emoji.
    const text = Array.from(raw).slice(0, COVER_LIMITS.titleMax).join("");
    const s = useEditorStore.getState();
    if (!s.project) return;
    const next = withCover(s.project, coverTimeOf(s.project), text);
    if (next !== s.project) {
      if (typed.current !== s.project || s.future.length > 0) s.beginTransaction();
      s.applyTransient(() => next);
      typed.current = useEditorStore.getState().project;
    }
    setDraft({ text, stored: useEditorStore.getState().project?.cover?.title ?? "" });
  };
  const reset = () => {
    useEditorStore.getState().apply((p) => setCover(p, null));
    setDraft(null); setNote("");
  };
  // The saved picture is this panel's frame view scaled up (not an export render). Whatever happens is said in the panel, next to
  // the button. The button is disabled while the keyboard is up (the frame is out of view then), and the same line says so.
  const save = async () => {
    if (busy.current || typing) return;
    busy.current = true;
    setSaving(true);
    setNote("");
    try {
      // Loaded here, not at the top of the file: the package looks its native module up on import, and the editor must open without it.
      const { captureRef, releaseCapture } = require("react-native-view-shot") as typeof import("react-native-view-shot");
      const perm = await requestPermissionsAsync(true);   // add-only access
      if (!perm.granted) { setNote("Allow Photos access in Settings to save."); return; }
      // view-shot takes the size in points and renders at the screen's scale: divide, so the file has exactly these pixels.
      const points = (px: number) => px / PixelRatio.get();
      const size = coverSaveSize(ratio);
      const file = await captureRef(frameRef, { format: "jpg", quality: 0.92, result: "tmpfile", width: points(size.width), height: points(size.height) });
      try {
        await saveToLibraryAsync(file);
        setNote("Saved to Photos");
      } finally { releaseCapture(file); }   // Photos has its own copy: the temporary file goes
    } catch { setNote("Couldn't save the cover."); }
    finally { busy.current = false; setSaving(false); }
  };

  // The slider is the panel's lead row: it does not scroll, so it is in reach on the shortest phone, and the frame it moves is the
  // first thing in the body, right under it. (`flex: 1` here is the row's WIDTH; its height is explicit.)
  const timeRow = (
    <View testID="cover-time-row" style={{ flex: 1, height: theme.size.touch, justifyContent: "center" }}>
      <Slider testID="cover-time" accessibilityLabel="Cover time" minimumValue={0} maximumValue={total} step={0.1} value={time}
        onSlidingStart={() => { dragging.current = true; useEditorStore.getState().beginTransaction(); }}
        onValueChange={slide}
        // The last value is written before the hold ends (it is still part of the drag's step), then the exact still is asked for.
        onSlidingComplete={(v) => { slide(v); dragging.current = false; load(true); }} />
    </View>
  );
  /** The line above the button: why Save is off while the keyboard is up, else what the last save came to. */
  const message = typing ? "Close the keyboard to save." : note;

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Cover" action={{ label: "Reset", onPress: reset }} lead={timeRow}>
      <View testID="cover-frame-row" style={{ height: FRAME_HEIGHT, alignItems: "center", justifyContent: "center" }}>
        <CoverFrame ref={frameRef} uri={uri} title={title} width={FRAME_HEIGHT * ratio * scale} height={FRAME_HEIGHT * scale} />
      </View>
      <View style={{ gap: theme.space.xs }}>
        {/* The return key puts the keyboard away (a one-line field blurs on submit): the panel is tall again. */}
        <Field accessibilityLabel="Cover title" value={title} onChangeText={type} returnKeyType="done" placeholder="Add a title" />
        <Body muted style={{ fontSize: theme.type.small, textAlign: "right" }}>{`${Array.from(title).length} / ${COVER_LIMITS.titleMax}`}</Body>
      </View>
      {message ? <Body muted style={{ textAlign: "center" }}>{message}</Body> : null}
      <PrimaryButton title="Save to Photos" disabled={saving || typing} onPress={() => { void save(); }} />
    </ToolPanel>
  );
}
