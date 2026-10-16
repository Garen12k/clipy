import { useEffect, useMemo } from "react";
import { ScrollView, View } from "react-native";
import { isPeaksAvailable } from "@/modules/clipy-video";
import { removePauses } from "@/src/editor/model/ops";
import { findPauses, PAUSE_GAPS, PAUSE_QUIET, type PauseChoice, type PauseCut, type PauseFind } from "@/src/editor/model/pauses";
import { pauseOptions, pauseSaving, usePauseListening, type PauseState } from "@/src/editor/pauseFind";
import { usePauses } from "@/src/editor/pausesState";
import { useEditorStore } from "@/src/editor/store";
import { contextFor } from "@/src/editor/toolbarContext";
import { useItemClip } from "@/src/editor/useItem";
import { PAUSES_TOOLS } from "@/src/lib/buildInfo";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { STRIP, ToolStrip } from "@/src/ui/ToolStrip";

/** Every sentence of the strip (spec §2.7). */
export const PAUSE_WORDS = {
  listening: "Listening…",
  missing: "The file of this clip is missing.",
  tooLong: "Remove pauses works on clips up to 10 minutes. Trim or split this clip first.",
  noSound: "This clip has no sound.",
  failed: "Could not listen to this clip. Close and open Remove pauses to try again.",
  silent: "This clip is silent.",
  none: "No pauses found",
  notRemoved: "Nothing was removed.",
} as const;
/** Said when Remove is tapped on a clip that no longer fits the tool, or no longer has the trim it was listened to over. */
export const PAUSE_CHANGED = "This clip has changed. Nothing was removed.";
export const foundLine = (n: number, seconds: number): string => `${n === 1 ? "1 pause" : `${n} pauses`} found · ${seconds.toFixed(1)} s shorter`;
export const removeTitle = (n: number): string => (n === 1 ? "Remove 1 Pause" : `Remove ${n} Pauses`);
export const removedMessage = (n: number): string => (n === 1 ? "1 pause removed" : `${n} pauses removed`);
/** A choice row's label column: two lines of the smallest text, so both rows' chips fit a 375-pt phone. */
export const PAUSE_LABEL_WIDTH = 88;
const NO_CUTS: PauseCut[] = [];

/** The status line: the first that applies. */
export function pauseStatus(a: { build: boolean; missing: boolean; state: PauseState | null; found: PauseFind | null; saving: number }): string {
  if (a.build) return PAUSES_TOOLS;
  if (a.missing) return PAUSE_WORDS.missing;
  const s = a.state;
  if (s === null || s.status === "listening") return PAUSE_WORDS.listening;
  if (s.status === "failed") return s.reason === "build" ? PAUSES_TOOLS : s.reason === "tooLong" ? PAUSE_WORDS.tooLong : s.reason === "noSound" ? PAUSE_WORDS.noSound : PAUSE_WORDS.failed;
  if (a.found === null) return PAUSE_WORDS.listening;
  if (a.found.silent) return PAUSE_WORDS.silent;
  return a.found.cuts.length === 0 ? PAUSE_WORDS.none : foundLine(a.found.cuts.length, a.saving);
}

/** One row of the strip (STRIP.slider high): the label, then the chips (they scroll rather than clip at a large text size). */
function ChoiceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingLeft: theme.space.gutter }}>
      <Body muted numberOfLines={2} style={{ width: PAUSE_LABEL_WIDTH, fontSize: theme.type.micro }}>{label}</Body>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, height: STRIP.slider }}
        contentContainerStyle={{ alignItems: "center", gap: theme.space.xs, paddingRight: theme.space.gutter }}>
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * Remove pauses on the selected MAIN video clip: it listens to the clip's own sound when it opens (`usePauseListening`; nothing on
 * load), the chips re-compute from what was heard at once, the cuts are shaded on the clip (`usePauses.shades`), and Remove applies
 * `removePauses` as ONE step — then the strip closes and the message bar says it, with Undo.
 */
export function RemovePausesSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const main = useEditorStore((s) => clipId !== null && !!s.project?.clips.some((c) => c.id === clipId));
  const uri = clip?.sourceUri ?? null, from = clip?.trimStart ?? 0, to = clip?.trimEnd ?? 0, speed = clip?.speed ?? 1;
  const missing = useEditorStore((s) => uri !== null && s.missingSourceUris.includes(uri));
  const choice = usePauses((s) => s.choice);
  const build = !isPeaksAvailable();
  const source = useMemo(() => (visible && main && uri !== null && !missing && !build ? { uri, from, to } : null), [visible, main, uri, from, to, missing, build]);
  const state = usePauseListening(source);
  const found = useMemo(() => {
    if (!clip || state?.status !== "ready" || state.outline.from !== clip.trimStart || state.outline.to !== clip.trimEnd) return null;
    return findPauses(state.outline, pauseOptions(clip, choice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, choice, from, to, speed]);
  const cuts = found?.cuts ?? NO_CUTS;
  useEffect(() => {
    if (!visible || clipId === null || cuts.length === 0) return;
    usePauses.setState({ shades: { clipId, cuts } });
    return () => usePauses.setState({ shades: null });
  }, [visible, clipId, cuts]);
  if (!clip || !main) return null;
  const n = cuts.length;
  const pick = (patch: Partial<PauseChoice>) => usePauses.setState((s) => ({ choice: { ...s.choice, ...patch } }));
  const remove = () => {
    const { project, apply } = useEditorStore.getState();
    if (!project || n === 0) return;
    // Asked again at the tap: what made the bar offer the tool (contextFor), and the very trim and speed the cuts were found for.
    const now = project.clips.find((c) => c.id === clip.id);
    const same = !!now && state?.status === "ready" && now.trimStart === state.outline.from && now.trimEnd === state.outline.to
      && now.trimStart === clip.trimStart && now.trimEnd === clip.trimEnd && now.speed === clip.speed
      && contextFor({ clipId: clip.id, overlayId: null, effectId: null, audioId: null, section: null }, project).tools.includes("pauses");
    if (!same) {
      onClose();                                                                     // close first …
      useToast.getState().show(PAUSE_CHANGED, { kind: "problem" });                  // … say second
      return;
    }
    const next = removePauses(project, clip.id, cuts);
    if (next === project) { useToast.getState().show(PAUSE_WORDS.notRemoved, { kind: "problem" }); return; }
    haptic("medium");
    apply(() => next);
    onClose();                                                                       // close first …
    useToast.getState().show(removedMessage(n), { kind: "done", undo: true });       // … say second
  };
  return (
    <ToolStrip visible={visible} onClose={onClose} title="Remove pauses">
      <ChoiceRow label="Cut pauses longer than">
        {PAUSE_GAPS.map((g) => <Chip compact key={g.id} label={g.label} accessibilityLabel={g.spoken} selected={choice.gap === g.id} onPress={() => pick({ gap: g.id })} />)}
      </ChoiceRow>
      <ChoiceRow label="What counts as quiet">
        {PAUSE_QUIET.map((q) => <Chip compact key={q.id} label={q.label} selected={choice.quiet === q.id} onPress={() => pick({ quiet: q.id })} />)}
      </ChoiceRow>
      <View testID="pauses-status" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.gutter }}>
        <Body muted numberOfLines={n > 0 ? 1 : 2} style={{ flex: 1, fontSize: theme.type.small }}>
          {pauseStatus({ build, missing, state, found, saving: found ? pauseSaving(clip, cuts) : 0 })}
        </Body>
        {n > 0 ? <PrimaryButton compact tone="plain" title={removeTitle(n)} onPress={remove} /> : null}
      </View>
    </ToolStrip>
  );
}
