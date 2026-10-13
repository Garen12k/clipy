import { View } from "react-native";
import { formatBytes } from "@/src/export/estimate";
import { theme } from "@/src/theme/theme";
import { QuietButton } from "@/src/ui/QuietButton";
import { Body } from "@/src/ui/Text";
import { useSurfaces } from "@/src/ui/tone";
import type { Transfer } from "./useProjectFile";

/** What the card says while a project file is written or read. Only what the app knows. */
export const TRANSFER = { save: "Saving a copy", open: "Opening project file" } as const;

/** A whole percent, 0 … 100 whatever the numbers say (a save's progress counts the body only and its size the whole file). */
const percentOf = (t: Transfer): number => {
  if (!(t.bytes > 0)) return 0;
  const p = Math.floor((t.done * 100) / t.bytes);
  return p >= 100 ? 100 : p > 0 ? p : 0;
};

/**
 * Home's bottom actions give way to this ONE card while a project file is saved or opened (Home is inert meanwhile, as while a
 * project is made): what is happening, the project's name and size, a bar, Cancel. Plain views, a solid colour (never glass); the
 * bar's width is a style value — nothing is animated.
 */
export function TransferCard({ transfer, onCancel }: { transfer: Transfer; onCancel: () => void }) {
  const s = useSurfaces();
  const percent = percentOf(transfer);
  const detail = [transfer.name, transfer.bytes >= 1e6 ? formatBytes(transfer.bytes) : null].filter(Boolean).join(" · ");
  return (
    <View testID="home-transfer" style={{ flex: 1, gap: theme.space.sm, paddingVertical: theme.space.md, paddingHorizontal: theme.space.lg, borderRadius: theme.radius.card, backgroundColor: s.bar }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space.md }}>
        {/* One accessible element: the two lines are read once. */}
        <View accessible accessibilityLabel={[TRANSFER[transfer.kind], detail].filter(Boolean).join(", ")} style={{ flex: 1 }}>
          <Body weight="semi">{TRANSFER[transfer.kind]}</Body>
          {detail ? <Body muted numberOfLines={1}>{detail}</Body> : null}
        </View>
        <QuietButton compact title="Cancel" onPress={onCancel} />
      </View>
      <View testID="home-transfer-bar" accessible accessibilityRole="progressbar" accessibilityLabel={TRANSFER[transfer.kind]} accessibilityValue={{ min: 0, max: 100, now: percent }} style={{ height: theme.space.xs, borderRadius: theme.radius.pill, backgroundColor: s.tile, overflow: "hidden" }}>
        <View testID="home-transfer-fill" style={{ width: `${percent}%`, height: theme.space.xs, backgroundColor: s.accentInk }} />
      </View>
    </View>
  );
}
