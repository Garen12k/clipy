import { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { clampExportSettings, EXPORT_FPS, EXPORT_QUALITIES, type ExportSettings, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { fileSize } from "@/src/lib/fileInfo";
import { formatDuration } from "@/src/lib/format";
import { Compass } from "@/src/theme/Compass";
import { theme } from "@/src/theme/theme";
import { Card } from "@/src/ui/Card";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { ProgressRing } from "@/src/ui/ProgressRing";
import { QuietButton } from "@/src/ui/QuietButton";
import { Screen } from "@/src/ui/Screen";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Body, Title, ValueLabel } from "@/src/ui/Text";
import { canExport4K, estimateBytes, exportableClips, exportDuration, formatBytes, QUALITY_LABELS, RESOLUTIONS, type Resolution } from "./estimate";
import type { ExportState } from "./useExport";

type Props = {
  project: Project; missingSourceUris?: string[]; state: ExportState; start: (r: Resolution, s: ExportSettings) => void; cancel: () => void; reset: () => void;
  onSave: () => void; onShare: () => void; onDone: () => void;
  /** When given, "Post to…" is the main action on the finish screen and Save to Photos steps down to secondary. */
  onPost?: () => void;
};

/** A row of choices: its label over its chips — the spacing of an editor strip's rows. */
const section = { gap: theme.space.sm } as const;
const chips = { flexDirection: "row", gap: theme.space.sm } as const;
const rowLabel = { fontSize: theme.type.label } as const;

export function ExportScreenBody({ project, missingSourceUris = [], state, start, cancel, reset, onSave, onShare, onDone, onPost }: Props) {
  const [res, setRes] = useState<Resolution>(1080);
  // Read clamped: settings the app does not offer (a damaged file) still show a selected chip — the defaults.
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
  const resLabel = RESOLUTIONS.find((r) => r.value === res)?.label ?? "";

  return (
    // Presented as an iOS page sheet, which already sits below the status bar: only the bottom inset applies.
    <Screen edges={["bottom"]} style={{ paddingHorizontal: theme.space.gutter, paddingTop: theme.space.xl, gap: theme.space.xl }}>
      <Title size={theme.type.screen}>Export</Title>
      {(state.status === "idle" || state.status === "unavailable") && (
        <View testID="export-options" style={{ gap: theme.space.lg }}>
          <View style={section}>
            <Body muted style={rowLabel}>Resolution</Body>
            <View style={chips}>
              {RESOLUTIONS.map((r) => <Chip key={r.value} label={r.label} selected={res === r.value} disabled={r.value === 2160 && !has4K} onPress={() => setRes(r.value)} />)}
            </View>
            {!has4K && <Body muted style={{ fontSize: theme.type.small }}>4K needs a 4K source clip.</Body>}
          </View>
          <View style={section}>
            <Body muted style={rowLabel}>Frame rate</Body>
            <View style={chips}>
              {EXPORT_FPS.map((f) => <Chip key={f} label={`${f} fps`} selected={settings.fps === f} onPress={() => change({ fps: f })} />)}
            </View>
          </View>
          <View style={section}>
            <Body muted style={rowLabel}>Quality</Body>
            <View style={chips}>
              {EXPORT_QUALITIES.map((q) => <Chip key={q} label={QUALITY_LABELS[q]} selected={settings.quality === q} onPress={() => change({ quality: q })} />)}
            </View>
          </View>
          <ValueLabel label="Estimated size:" value={formatBytes(estimateBytes(duration, res, settings))} />
        </View>
      )}
      {state.status === "unavailable" && (
        <Card style={{ gap: theme.space.sm }}>
          <Title size={theme.type.heading}>Export needs the native build</Title>
          <Body>Rendering the final video uses Clipy's Swift engine, which Expo Go can't load. Install a development build to export.</Body>
          <Body muted>Everything else in Clipy works in Expo Go.</Body>
        </Card>
      )}
      {state.status === "idle" && (
        <PrimaryButton title="Export" onPress={() => start(res, settings)}
          icon={<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Compass size={theme.size.icon.md} /></View>} />
      )}
      {state.status === "exporting" && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space.lg }}>
          <ProgressRing progress={state.progress} size={theme.size.ring} />
          <Body muted>Exporting…</Body>
          <SecondaryButton title="Cancel" onPress={cancel} />
        </View>
      )}
      {state.status === "done" && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space.md }}>
          <ProgressRing progress={1} size={theme.size.ring} done />
          <Title size={theme.type.title}>Ready to sail</Title>
          <Body weight="semi" style={{ fontVariant: ["tabular-nums"] }}>{[resLabel, formatDuration(duration), bytes > 0 ? formatBytes(bytes) : null].filter(Boolean).join(" · ")}</Body>
          <View style={{ alignSelf: "stretch", gap: theme.space.md, marginTop: theme.space.lg }}>
            {onPost ? (<>
              <PrimaryButton title="Post to…" onPress={onPost} />
              <SecondaryButton title="Save to Photos" onPress={onSave} />
            </>) : <PrimaryButton title="Save to Photos" onPress={onSave} />}
            <SecondaryButton title="Share" onPress={onShare} />
            <QuietButton title="Done" onPress={onDone} />
          </View>
        </View>
      )}
      {state.status === "error" && (
        <View style={{ gap: theme.space.lg }}>
          <Card testID="export-error" style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
            <Ionicons testID="export-error-icon" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" name="alert-circle-outline" size={theme.size.icon.lg} color={theme.colors.danger} />
            <Body style={{ flex: 1 }}>{state.message}</Body>
          </Card>
          <PrimaryButton title="Try again" onPress={reset} />
        </View>
      )}
    </Screen>
  );
}
