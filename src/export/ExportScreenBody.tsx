import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/src/ui/Icon";
import { ScrollView, StyleSheet, View } from "react-native";
import { clampExportSettings, EXPORT_FPS, EXPORT_QUALITIES, type ExportSettings, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { fileSize } from "@/src/lib/fileInfo";
import { formatDuration } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { useSurfaces } from "@/src/ui/tone";
import { Card } from "@/src/ui/Card";
import { haptic } from "@/src/ui/haptics";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { ProgressRing } from "@/src/ui/ProgressRing";
import { QuietButton } from "@/src/ui/QuietButton";
import { Screen } from "@/src/ui/Screen";
import { ScreenBar } from "@/src/ui/ScreenBar";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Segmented } from "@/src/ui/Segmented";
import { Body, Title } from "@/src/ui/Text";
import { EXPORT_PAUSED } from "./backgroundExport";
import { NotifyOfferCard, useNotifyOffer } from "./notifyOffer";
import { canExport4K, estimateBytes, exportableClips, exportDuration, formatBytes, QUALITY_LABELS, RESOLUTIONS, type Resolution } from "./estimate";
import type { ExportState } from "./useExport";

type Props = {
  project: Project; missingSourceUris?: string[]; state: ExportState; start: (r: Resolution, s: ExportSettings) => void; cancel: () => void; reset: () => void;
  onSave: () => void; onShare: () => void;
  /** Leaves the sheet: the Done button of the finish screen and the bar's Close (which is inert while exporting, as the swipe is). */
  onDone: () => void;
  /** When given, "Post to…" is the main action on the finish screen and Save to Photos steps down to secondary. */
  onPost?: () => void;
};

/** One row of the options card: its small muted label over its segments. */
const row = { gap: theme.space.sm } as const;
const rowLabel = { fontSize: theme.type.label } as const;
/** The ring and its words, in the middle of the room the pinned actions leave. */
const centre = { flex: 1, paddingHorizontal: theme.space.gutter, alignItems: "center", justifyContent: "center", gap: theme.space.md } as const;
/** The grabber of a sheet: the modal presentation draws none of its own. The bar below it pads its own edges, so each block pads its own too. */
const GRABBER = { width: 36, height: 5 } as const;
/** A line under the ring's word: what the export is doing about the app having been left. */
const note = { fontSize: theme.type.small, textAlign: "center" } as const;
const FPS_OPTIONS = EXPORT_FPS.map((f) => ({ value: f, label: `${f} fps` }));
const QUALITY_OPTIONS = EXPORT_QUALITIES.map((q) => ({ value: q, label: QUALITY_LABELS[q] }));

/** The quiet line between two rows of the card. */
function Line() {
  const s = useSurfaces();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: s.separator }} />;
}

export function ExportScreenBody({ project, missingSourceUris = [], state, start, cancel, reset, onSave, onShare, onDone, onPost }: Props) {
  const s = useSurfaces();
  const [res, setRes] = useState<Resolution>(1080);
  // Read clamped: settings the app does not offer (a damaged file) still show a picked segment — the defaults.
  const [settings, setSettings] = useState<ExportSettings>(() => clampExportSettings(project.exportSettings));
  const change = (patch: Partial<ExportSettings>) => { const next = { ...settings, ...patch }; setSettings(next); useEditorStore.getState().setExportSettings(next); };
  const clips = exportableClips(project, missingSourceUris);
  const has4K = canExport4K(clips);
  const duration = exportDuration(project, missingSourceUris);
  const doneUri = state.status === "done" ? state.fileUri ?? "" : "";
  const bytes = useMemo(() => fileSize(doneUri), [doneUri]);
  const wasDone = useRef(false);
  useEffect(() => {
    if (state.status === "done" && !wasDone.current) haptic("success");
    wasDone.current = state.status === "done";
  }, [state.status]);
  // The notification offer (only while iOS has never been asked). Its room is kept after Continue, at the height it was drawn with,
  // until the export ends: the ring and Cancel stay where they are when the card goes.
  const offer = useNotifyOffer(state.status === "exporting");
  const [offerHeight, setOfferHeight] = useState(0);
  const resLabel = RESOLUTIONS.find((r) => r.value === res)?.label ?? "";
  const estimate = formatBytes(estimateBytes(duration, res, settings));

  return (
    // Presented as an iOS page sheet, which already sits below the status bar: only the bottom inset applies.
    <Screen edges={["bottom"]} style={{ paddingTop: theme.space.sm, gap: theme.space.lg }}>
      <View testID="export-grabber" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ alignSelf: "center", width: GRABBER.width, height: GRABBER.height, borderRadius: theme.radius.pill, backgroundColor: s.muted, opacity: 0.5 }} />
      <ScreenBar title="Export" leading="close" onLeading={onDone} leadingDisabled={state.status === "exporting"} />
      {(state.status === "idle" || state.status === "unavailable") && (
        // The choices scroll only if a small phone cannot hold them: the gold button below never leaves the bottom.
        <ScrollView testID="export-scroll" style={{ flex: 1 }} alwaysBounceVertical={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: theme.space.gutter, gap: theme.space.lg }}>
          <Card testID="export-options" style={{ gap: theme.space.md }}>
            <View style={row}>
              <Body muted style={rowLabel}>Resolution</Body>
              <Segmented options={RESOLUTIONS.map((r) => ({ value: r.value, label: r.label, disabled: r.value === 2160 && !has4K }))} value={res} onChange={setRes} />
              {!has4K && <Body muted style={{ fontSize: theme.type.small }}>4K needs a 4K source clip.</Body>}
            </View>
            <Line />
            <View style={row}>
              <Body muted style={rowLabel}>Frame rate</Body>
              <Segmented options={FPS_OPTIONS} value={settings.fps} onChange={(fps) => change({ fps })} />
            </View>
            <Line />
            <View style={row}>
              <Body muted style={rowLabel}>Quality</Body>
              <Segmented options={QUALITY_OPTIONS} value={settings.quality} onChange={(quality) => change({ quality })} />
            </View>
            <Line />
            <View testID="export-estimate" accessible accessibilityLabel={`Estimated size, ${estimate}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space.md }}>
              <Body>Estimated size</Body>
              <Body muted style={{ fontVariant: ["tabular-nums"] }}>{estimate}</Body>
            </View>
          </Card>
          {state.status === "unavailable" && (
            <Card style={{ gap: theme.space.sm }}>
              <Title size={theme.type.heading}>Export needs the native build</Title>
              <Body>Rendering the final video uses Clipy's Swift engine, which Expo Go can't load. Install a development build to export.</Body>
              <Body muted>Everything else in Clipy works in Expo Go.</Body>
            </Card>
          )}
        </ScrollView>
      )}
      {state.status === "exporting" && (
        // The ring keeps the middle; the offer has its own place under it, above the pinned Cancel — never among the pinned actions.
        <View style={{ flex: 1 }}>
          <View style={centre}>
            <ProgressRing progress={state.progress} size={theme.size.ring} />
            <Body muted>Exporting…</Body>
            {/* Clipy is out of sight (what the app switcher shows): the export waits and goes on by itself. Only on a build that holds the frames. */}
            {state.paused ? <Body testID="export-paused" muted style={note}>{EXPORT_PAUSED}</Body> : null}
            {/* One sentence for an export that was started again by itself. */}
            {state.note ? <Body testID="export-note" muted style={note}>{state.note}</Body> : null}
          </View>
          {offer.shown ? (
            <View testID="export-notify-place" onLayout={(e) => setOfferHeight(e.nativeEvent.layout.height)} style={{ paddingHorizontal: theme.space.gutter }}>
              <NotifyOfferCard onContinue={offer.accept} />
            </View>
          ) : offer.kept ? <View testID="export-notify-place" style={{ height: offerHeight }} /> : null}
        </View>
      )}
      {state.status === "done" && (
        <View style={centre}>
          <ProgressRing progress={1} size={theme.size.ring} done />
          <Title size={theme.type.title}>Ready to sail</Title>
          <Body weight="semi" style={{ fontVariant: ["tabular-nums"] }}>{[resLabel, formatDuration(duration), bytes > 0 ? formatBytes(bytes) : null].filter(Boolean).join(" · ")}</Body>
        </View>
      )}
      {state.status === "error" && (
        <View style={{ flex: 1, paddingHorizontal: theme.space.gutter }}>
          <Card testID="export-error" style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
            <Icon testID="export-error-icon" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" name="alert-circle-outline" size={theme.size.icon.lg} color={s.danger} />
            <Body style={{ flex: 1, fontSize: theme.type.body }}>{state.message}</Body>
          </Card>
        </View>
      )}
      {/* The state's actions, pinned at the bottom of the sheet above the home indicator: what is above takes the room that is left. */}
      {state.status !== "unavailable" && (
        <View testID="export-actions" style={{ paddingHorizontal: theme.space.gutter, gap: theme.space.md }}>
          {state.status === "idle" && <PrimaryButton title="Export" onPress={() => start(res, settings)} />}
          {state.status === "exporting" && <SecondaryButton title="Cancel" onPress={cancel} />}
          {state.status === "done" && (<>
            {onPost ? (<>
              <PrimaryButton title="Post to…" onPress={onPost} />
              <SecondaryButton title="Save to Photos" onPress={onSave} />
            </>) : <PrimaryButton title="Save to Photos" onPress={onSave} />}
            <View testID="export-quiet-row" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <QuietButton title="Share" onPress={onShare}
                icon={<Icon testID="export-share-icon" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" name="share-outline" size={theme.size.icon.md} color={s.accentInk} />} />
              <QuietButton title="Done" onPress={onDone} />
            </View>
          </>)}
          {state.status === "error" && <PrimaryButton title="Try Again" onPress={reset} />}
        </View>
      )}
    </Screen>
  );
}
