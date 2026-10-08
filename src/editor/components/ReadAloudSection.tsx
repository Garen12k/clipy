import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { isSpeechAvailable, listVoices, type SpeechVoices } from "@/modules/clipy-video";
import { languagesOf, paceLabel, pickVoice, speakableText, SPEECH_LIMITS, voiceLabel, voicesOf } from "@/src/editor/model/speech";
import { isTextOverlay } from "@/src/editor/model/types";
import { loadSpeechPrefs, saveSpeechPrefs, type SpeechPrefs } from "@/src/editor/speechPrefs";
import { useEditorStore } from "@/src/editor/store";
import { READ_ALOUD, useReadAloud } from "@/src/editor/useReadAloud";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { PressableScale } from "@/src/ui/PressableScale";
import { QuietButton } from "@/src/ui/QuietButton";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Slider } from "@/src/ui/Slider";
import { Spinner } from "@/src/ui/Spinner";
import { Body, ValueLabel } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";

const ROW = { height: theme.size.touch, flexDirection: "row", alignItems: "center", gap: theme.space.md } as const;
/** The row's name takes the rest of the row's width (the row has an explicit height: this `flex` is a width). */
const NAME = { flex: 1, height: theme.size.touch, flexDirection: "row", alignItems: "center", gap: theme.space.sm } as const;
const BODY = { gap: theme.space.md, paddingBottom: theme.space.md } as const;
/** A row of chips that scrolls sideways (an iPhone has dozens of voices): its height is explicit. */
const CHIP_ROW = { height: theme.size.touch } as const;
const CHIPS = { alignItems: "center", gap: theme.space.sm } as const;
/** The normal pace: the slider ticks lightly when a drag reaches or passes it. */
const REST = [SPEECH_LIMITS.defaultPace] as const;
export const NO_VOICES = "No voices are installed on this iPhone.";
export const VOICES_FAILED = "Could not read the list of voices.";
/** How to ask again (`toggle` asks the phone anew when a failed list is opened). */
export const VOICES_RETRY = "Close and open this row to try again.";
export const VOICES_HINT = "These are the voices installed on this iPhone. More can be added in the iPhone Settings, under Accessibility.";
/** Said when the words were edited while the phone was speaking them: the reading is dropped (`useReadAloud`), and the spinner would otherwise just end. */
export const TEXT_CHANGED = "The text changed, so nothing was read. Tap Read aloud again.";

type Loaded = { state: "none" } | { state: "loading" } | { state: "failed" } | { state: "ready"; list: SpeechVoices };

/** What would be read of this text right now; null when it is not there (or is not a text). */
const wordsOf = (overlayId: string): string | null => {
  const o = useEditorStore.getState().project?.overlays.find((x) => x.id === overlayId);
  return o && isTextOverlay(o) ? speakableText(o.text) : null;
};

/**
 * Read aloud, a row of the Text panel (texts only): closed at first, like the look rows. Open, it lists the languages and voices
 * installed on the iPhone, a Speed, and the button that turns the text into a voice bar (`useReadAloud`). The voice and the speed
 * are a preference of this phone (speechPrefs.ts), never project data: choosing them is no undo step and writes nothing to the project.
 * The list is asked of the phone when the row is opened, never before. Without the build that can speak, the row stays closed and
 * says what is needed. A reading under way ends when the row is closed, when it leaves the screen (the panel closed: the hook stops
 * as it unmounts) and when the panel moves to another text. Every row has an explicit height; nothing here animates.
 */
export function ReadAloudSection({ overlayId }: { overlayId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>({ state: "none" });
  const [prefs, setPrefs] = useState(loadSpeechPrefs);
  const [language, setLanguage] = useState<string | null>(null);
  const { read, stop, busy } = useReadAloud();
  // Counts the readings begun and the readings given up by hand: a reading whose number has moved on has nothing more to say.
  const turn = useRef(0);
  const giveUp = () => { turn.current += 1; stop(); };
  // Another text in the same panel (Duplicate, a tap on the preview): the reading of the text before it is given up.
  useEffect(() => () => { turn.current += 1; stop(); }, [overlayId, stop]);

  const load = () => {
    setLoaded({ state: "loading" });
    let asked: Promise<SpeechVoices>;
    try { asked = listVoices(); } catch { setLoaded({ state: "failed" }); return; }
    asked.then((list) => {
      const voice = pickVoice(list.voices, list.current, prefs.voiceId);
      setLoaded({ state: "ready", list });
      setLanguage(voice ? voice.language : null);
      // Shown as chosen, not saved: only a tap is remembered.
      if (voice && voice.id !== prefs.voiceId) setPrefs((p) => ({ ...p, voiceId: voice.id }));
    }, () => setLoaded({ state: "failed" }));
  };
  const toggle = () => {
    // Closing while the phone is speaking ends the reading first: a bar must not appear later from a row that shows nothing.
    if (open) { if (busy) giveUp(); setOpen(false); return; }
    if (!isSpeechAvailable()) { useToast.getState().show(READ_ALOUD.unavailable); return; }
    setOpen(true);
    if (loaded.state === "none" || loaded.state === "failed") load();
  };
  /** A choice is remembered at once (a preference, not an edit). */
  const remember = (next: SpeechPrefs) => { setPrefs(next); saveSpeechPrefs(next); };
  const pickLanguage = (code: string, list: SpeechVoices) => {
    if (code === language) return;
    setLanguage(code);
    const best = voicesOf(list.voices, code)[0];
    if (best) remember({ ...prefs, voiceId: best.id });
  };
  /** The slider's value as a pace: whole hundredths, so "Normal" is exactly the middle. */
  const paceOf = (v: number) => Math.round(v * 100) / 100;
  const start = async () => {
    const mine = ++turn.current;
    const words = wordsOf(overlayId);
    const made = await read(overlayId, prefs.voiceId, prefs.pace);
    if (made || turn.current !== mine) return;
    // The hook has said why for every refusal and failure; a reading dropped because the words changed meanwhile it drops silently.
    const now = wordsOf(overlayId);
    if (words !== null && now !== null && now !== words) useToast.getState().show(TEXT_CHANGED);
  };

  const list = loaded.state === "ready" ? loaded.list : null;
  const voices = list && language ? voicesOf(list.voices, language) : [];

  return (
    <View testID="read-aloud">
      <View testID="read-aloud-row" style={ROW}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Read aloud options" accessibilityState={{ expanded: open }} onPress={toggle} style={NAME}>
          <Body weight="semi">Read aloud</Body>
          <Ionicons name={open ? "chevron-up-outline" : "chevron-down-outline"} size={theme.size.icon.md} color={theme.colors.textMuted} />
        </PressableScale>
      </View>
      {open ? (
        <View style={BODY}>
          {loaded.state === "loading" ? <View style={ROW}><Spinner label="Loading voices" /></View> : null}
          {loaded.state === "failed" ? <Body muted>{`${VOICES_FAILED} ${VOICES_RETRY}`}</Body> : null}
          {list && list.voices.length === 0 ? <Body muted>{NO_VOICES}</Body> : null}
          {list && list.voices.length > 0 ? (
            <>
              <ScrollView testID="read-aloud-languages" horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={CHIP_ROW} contentContainerStyle={CHIPS}>
                {languagesOf(list.voices, list.current).map((l) => <Chip key={l.code} label={l.name} selected={l.code === language} onPress={() => pickLanguage(l.code, list)} />)}
              </ScrollView>
              {/* One row per language (the key): another language starts at its best voice, a pick inside a language leaves the row where it was scrolled. */}
              <ScrollView key={language ?? ""} testID="read-aloud-voices" horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={CHIP_ROW} contentContainerStyle={CHIPS}>
                {voices.map((v) => <Chip key={v.id} label={voiceLabel(v)} selected={v.id === prefs.voiceId} onPress={() => remember({ ...prefs, voiceId: v.id })} />)}
              </ScrollView>
              <View>
                <ValueLabel label="Speed" value={paceLabel(prefs.pace)} />
                <Slider testID="read-aloud-speed" minimumValue={SPEECH_LIMITS.pace[0]} maximumValue={SPEECH_LIMITS.pace[1]} step={0.05} value={prefs.pace} detents={REST}
                  onValueChange={(v) => setPrefs((p) => ({ ...p, pace: paceOf(v) }))} onSlidingComplete={(v) => remember({ ...prefs, pace: paceOf(v) })} />
              </View>
              {/* One slot of one height: the button, or the spinner and Stop while the phone is speaking. */}
              <View style={ROW}>
                {busy ? (
                  <>
                    <Spinner label="Preparing the voice" />
                    <QuietButton compact title="Stop" onPress={giveUp} />
                  </>
                ) : (
                  <SecondaryButton title="Read aloud" onPress={() => { void start(); }} />
                )}
              </View>
              <Body muted style={{ fontSize: theme.type.micro }}>{VOICES_HINT}</Body>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
