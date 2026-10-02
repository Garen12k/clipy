import { useState } from "react";
import { View } from "react-native";
import { clipDuration } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";
import { Mark } from "@/src/theme/Mark";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Body, Heading } from "@/src/ui/Text";
import { canExport4K, estimateBytes, exportableClips, formatBytes, RESOLUTIONS, type Resolution } from "./estimate";
import type { ExportState } from "./useExport";

type Props = { project: Project; missingSourceUris?: string[]; state: ExportState; start: (r: Resolution) => void; cancel: () => void; reset: () => void; onSave: () => void; onShare: () => void; onDone: () => void };

export function ExportScreenBody({ project, missingSourceUris = [], state, start, cancel, reset, onSave, onShare, onDone }: Props) {
  const [res, setRes] = useState<Resolution>(1080);
  const clips = exportableClips(project, missingSourceUris);
  const has4K = canExport4K(clips);
  const duration = clips.reduce((s, c) => s + clipDuration(c), 0);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.space.xl, paddingTop: 48, gap: theme.space.xl }}>
      <Heading style={{ fontSize: 34 }}>Export</Heading>
      <View style={{ gap: theme.space.sm }}>
        <Body muted>Resolution</Body>
        <View style={{ flexDirection: "row", gap: theme.space.md }}>
          {RESOLUTIONS.map((r) => <Chip key={r.value} label={r.label} selected={res === r.value} disabled={r.value === 2160 && !has4K} onPress={() => setRes(r.value)} />)}
        </View>
        {!has4K && <Body muted style={{ fontSize: 12 }}>4K needs a 4K source clip.</Body>}
        <Body muted>Estimated size: {formatBytes(estimateBytes(duration, res))}</Body>
      </View>

      {state.status === "unavailable" && (
        <View style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline, borderWidth: 1, borderRadius: theme.radius.card, padding: theme.space.xl, gap: theme.space.sm }}>
          <Heading style={{ fontSize: 22 }}>Export needs the native build</Heading>
          <Body>Rendering the final video uses Clipy's Swift engine, which Expo Go can't load. Install a development build to export.</Body>
          <Body muted>Everything else in Clipy works in Expo Go.</Body>
        </View>
      )}
      {state.status === "idle" && <PrimaryButton title="Export" icon={<Mark size={20} color={theme.colors.text} />} onPress={() => start(res)} />}
      {state.status === "exporting" && (
        <View style={{ gap: theme.space.md }}>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: theme.colors.surfaceAlt, overflow: "hidden" }}>
            <View style={{ width: `${Math.round(state.progress * 100)}%`, height: "100%", backgroundColor: theme.colors.accent }} />
          </View>
          <Body muted>{Math.round(state.progress * 100)}%</Body>
          <PrimaryButton title="Cancel" onPress={cancel} />
        </View>
      )}
      {state.status === "done" && (
        <View style={{ gap: theme.space.md }}>
          <Body>Your video is ready.</Body>
          <PrimaryButton title="Save to Photos" onPress={onSave} />
          <PrimaryButton title="Share…" onPress={onShare} />
          <PrimaryButton title="Done" onPress={onDone} />
        </View>
      )}
      {state.status === "error" && (
        <View style={{ gap: theme.space.md }}>
          <Body style={{ color: theme.colors.danger }}>{state.message}</Body>
          <PrimaryButton title="Try again" onPress={reset} />
        </View>
      )}
    </View>
  );
}
