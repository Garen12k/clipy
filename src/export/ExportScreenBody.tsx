import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { clipDuration } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";
import { formatDuration } from "@/src/lib/format";
import { Compass } from "@/src/theme/Compass";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { ProgressRing } from "@/src/ui/ProgressRing";
import { Screen } from "@/src/ui/Screen";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Body, Title } from "@/src/ui/Text";
import { canExport4K, estimateBytes, exportableClips, formatBytes, RESOLUTIONS, type Resolution } from "./estimate";
import type { ExportState } from "./useExport";

type Props = { project: Project; missingSourceUris?: string[]; state: ExportState; start: (r: Resolution) => void; cancel: () => void; reset: () => void; onSave: () => void; onShare: () => void; onDone: () => void };

export function ExportScreenBody({ project, missingSourceUris = [], state, start, cancel, reset, onSave, onShare, onDone }: Props) {
  const [res, setRes] = useState<Resolution>(1080);
  const clips = exportableClips(project, missingSourceUris);
  const has4K = canExport4K(clips);
  const duration = clips.reduce((s, c) => s + clipDuration(c), 0);
  const wasDone = useRef(false);
  useEffect(() => {
    if (state.status === "done" && !wasDone.current) haptic("success");
    wasDone.current = state.status === "done";
  }, [state.status]);
  const resLabel = RESOLUTIONS.find((r) => r.value === res)?.label ?? "";

  return (
    // Presented as an iOS page sheet, which already sits below the status bar: only the bottom inset applies.
    <Screen edges={["bottom"]} style={{ padding: theme.space.xl, paddingTop: theme.space.xxl, gap: theme.space.xl }}>
      <Title size={26}>Export</Title>
      {(state.status === "idle" || state.status === "unavailable") && (
        <View style={{ gap: theme.space.sm }}>
          <Body muted>Resolution</Body>
          <View style={{ flexDirection: "row", gap: theme.space.md }}>
            {RESOLUTIONS.map((r) => <Chip key={r.value} label={r.label} selected={res === r.value} disabled={r.value === 2160 && !has4K} onPress={() => setRes(r.value)} />)}
          </View>
          {!has4K && <Body muted style={{ fontSize: 12 }}>4K needs a 4K source clip.</Body>}
          <Body muted>Estimated size: {formatBytes(estimateBytes(duration, res))}</Body>
        </View>
      )}
      {state.status === "unavailable" && (
        <View style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline, borderWidth: 1, borderRadius: theme.radius.card, padding: theme.space.xl, gap: theme.space.sm }}>
          <Title size={16}>Export needs the native build</Title>
          <Body>Rendering the final video uses Clipy's Swift engine, which Expo Go can't load. Install a development build to export.</Body>
          <Body muted>Everything else in Clipy works in Expo Go.</Body>
        </View>
      )}
      {state.status === "idle" && (
        <PrimaryButton title="Export" onPress={() => start(res)}
          icon={<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Compass size={18} /></View>} />
      )}
      {state.status === "exporting" && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space.xl }}>
          <ProgressRing progress={state.progress} size={140} />
          <SecondaryButton title="Cancel" onPress={cancel} />
        </View>
      )}
      {state.status === "done" && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space.md }}>
          <ProgressRing progress={1} size={120} done />
          <Title size={20}>Ready to sail</Title>
          <Body muted>{`${resLabel} · ${formatDuration(duration)}`}</Body>
          <View style={{ alignSelf: "stretch", gap: theme.space.md, marginTop: theme.space.lg }}>
            <PrimaryButton title="Save to Photos" onPress={onSave} />
            <SecondaryButton title="Share" onPress={onShare} />
            <SecondaryButton title="Done" onPress={onDone} />
          </View>
        </View>
      )}
      {state.status === "error" && (
        <View style={{ gap: theme.space.md }}>
          <Body style={{ color: theme.colors.danger }}>{state.message}</Body>
          <PrimaryButton title="Try again" onPress={reset} />
        </View>
      )}
    </Screen>
  );
}
