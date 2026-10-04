import Slider from "@react-native-community/slider";
import { requestPermissionsAsync, saveToLibraryAsync } from "expo-media-library/legacy";
import { useEffect, useRef, useState } from "react";
import { PixelRatio, TextInput, useWindowDimensions, View } from "react-native";
import { frameUriAt } from "@/src/editor/coverFrame";
import { setCover } from "@/src/editor/model/ops";
import { coverTimeOf, totalDuration } from "@/src/editor/model/timeline";
import { aspectRatioValue, COVER_LIMITS, type Cover } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { CoverFrame } from "./CoverFrame";

const FRAME_HEIGHT = 240;
/** The frame's height while the title is being typed: the keyboard must leave Done in view on a small iPhone. */
const TYPING_FRAME_HEIGHT = 120;
/** Width in pixels of the picture saved to Photos; its height follows the project's aspect ratio. */
const SAVE_WIDTH = 1080;
/** The draft is no cover at all: the first frame and no title (what a project without a cover already shows). */
const isBlank = (c: Cover) => c.time === 0 && c.title.trim() === "";
const field = { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, borderRadius: theme.radius.chip, fontFamily: theme.fonts.body, padding: 10, fontSize: 16, minWidth: 72 } as const;

/**
 * Picks the frame that stands for the video and a short title over it. The choice is a local draft: nothing is
 * written to the project until Done (one undo step); Reset is one undo step back to no cover; closing any other
 * way discards the draft.
 */
export function CoverSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const project = useEditorStore((s) => s.project);
  const apply = useEditorStore((s) => s.apply);
  const { width: windowW } = useWindowDimensions();
  const [time, setTime] = useState(0);
  const [title, setTitle] = useState("");
  const [uri, setUri] = useState<string | null>(null);
  const [note, setNote] = useState("");
  /** The title field has the keyboard: the frame is drawn small, so it is not the picture to save. */
  const [typing, setTyping] = useState(false);
  /** A save is running: the ref stops a second press at once, the state shows the button disabled. */
  const [saving, setSaving] = useState(false);
  const frameRef = useRef<View>(null);
  const busy = useRef(false);
  // Only the newest frame request may show: a slow thumbnail must not replace the still asked for after it.
  const request = useRef(0);

  const load = (at: number, exact: boolean) => {
    const p = useEditorStore.getState().project;
    if (!p) return;
    const mine = ++request.current;
    void frameUriAt(p, at, exact).then((next) => { if (mine === request.current) setUri(next); });
  };

  // Each opening starts from the stored cover (read clamped), or the first frame without a title. The exact still is
  // loaded straight away: the frame may be saved to Photos without the slider being touched.
  useEffect(() => {
    if (!visible) return;
    const p = useEditorStore.getState().project;
    if (!p || p.clips.length === 0) return;
    const start = coverTimeOf(p);
    setTime(start); setTitle(p.cover?.title ?? ""); setNote(""); setTyping(false);
    setUri(null);   // not the frame of the last opening's draft while this one's loads
    load(start, true);
    return () => { request.current++; };
  }, [visible]);

  if (!project || project.clips.length === 0) return null;

  const ratio = aspectRatioValue(project.aspectRatio);
  const frameH = typing ? TYPING_FRAME_HEIGHT : FRAME_HEIGHT;
  const scale = Math.min(1, (windowW - theme.space.xl * 2) / (frameH * ratio));
  const reset = () => {
    apply((p) => setCover(p, null));
    setTime(0); setTitle(""); setNote("");
    load(0, true);
  };
  const done = () => {
    // An untouched sheet on a project without a cover stays without one (no cover, no undo step).
    if (isBlank({ time, title })) { if (project.cover !== null) apply((p) => setCover(p, null)); }   // a blank cover is no cover
    else apply((p) => setCover(p, { time, title }));
    onClose();
  };
  // The saved picture is this sheet's frame view scaled up (not an export render). Whatever happens is said in the
  // sheet: a toast would be hidden under the Modal. The button is disabled while the title is being typed (the frame
  // is small then), so the view captured here is always the full-size frame.
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
      // view-shot takes the size in points and renders at the screen's scale: divide, so the file is SAVE_WIDTH pixels wide.
      const points = (px: number) => px / PixelRatio.get();
      const file = await captureRef(frameRef, { format: "jpg", quality: 0.92, result: "tmpfile", width: points(SAVE_WIDTH), height: points(Math.round(SAVE_WIDTH / ratio)) });
      try {
        await saveToLibraryAsync(file);
        setNote("Saved to Photos");
      } finally { releaseCapture(file); }   // Photos has its own copy: the temporary file goes
    } catch { setNote("Couldn't save the cover."); }
    finally { busy.current = false; setSaving(false); }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Cover" avoidKeyboard>
      <View style={{ alignItems: "center" }}>
        <CoverFrame ref={frameRef} uri={uri} title={title} width={frameH * ratio * scale} height={frameH * scale} />
      </View>
      <Slider
        testID="cover-time" accessibilityLabel="Cover time"
        minimumValue={0} maximumValue={totalDuration(project)} step={0.1}
        value={time}
        onValueChange={(v) => { setTime(v); load(v, false); }}
        onSlidingComplete={(v) => { setTime(v); load(v, true); }}
        minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent}
      />
      <View style={{ gap: theme.space.xs }}>
        {/* Cut by whole characters (code points): `maxLength` counts UTF-16 units and can split an emoji. The return key
            ends the typing (a one-line field blurs on submit), which brings the frame back to full size. */}
        <TextInput accessibilityLabel="Cover title" value={title} onChangeText={(t) => setTitle(Array.from(t).slice(0, COVER_LIMITS.titleMax).join(""))}
          returnKeyType="done" onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} onSubmitEditing={() => setTyping(false)}
          style={field} placeholder="Add a title" placeholderTextColor={theme.colors.textMuted} />
        <Body muted style={{ fontSize: 12, textAlign: "right" }}>{`${Array.from(title).length} / ${COVER_LIMITS.titleMax}`}</Body>
      </View>
      {note ? <Body muted style={{ textAlign: "center" }}>{note}</Body> : null}
      <PrimaryButton title="Done" onPress={done} />
      <View style={{ flexDirection: "row", justifyContent: "center", gap: theme.space.md }}>
        <SecondaryButton title="Save to Photos" disabled={saving || typing} onPress={() => { void save(); }} />
        <SecondaryButton title="Reset" onPress={reset} />
      </View>
    </Sheet>
  );
}
