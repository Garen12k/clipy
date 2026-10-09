import { Ionicons } from "@expo/vector-icons";
import { Image, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Body } from "@/src/ui/Text";
import type { PlatformStatus } from "../api";
import { PLATFORMS } from "../platforms";

/** The logo tile: a small rounded square, a step lighter than the card it sits on. */
const TILE = theme.size.chip;
/** The account's round picture on the tile's corner, ringed in the card's colour, and how far it reaches past the corner. */
const PICTURE = theme.size.icon.md;
const PEEK = 6;
const RING = 2;

type Props = {
  status: PlatformStatus;
  /** The state under the name ("Not connected", "Sign-in expired", "Not available yet"); "Sign-in expired" is red. */
  detail?: string | null;
  /** The platform cannot be used here now: its logo and name are muted. */
  dim?: boolean;
};

/**
 * What a platform row starts with, on Post and on Accounts: the logo tile (with the connected account's picture on its corner,
 * when it has one), then the platform's name with the account's name and / or its state under it. Two siblings for the caller's row.
 */
export function PlatformIdentity({ status, detail, dim }: Props) {
  const { label, icon } = PLATFORMS[status.id];
  const { connected, name, avatarUrl } = status;
  return (<>
    <View testID={`platform-tile-${status.id}`} style={{ width: TILE, height: TILE, borderRadius: theme.radius.chip, backgroundColor: theme.screen.tile, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={theme.size.icon.md} color={dim ? theme.screen.muted : theme.colors.text} />
      {connected && avatarUrl ? (
        <Image testID={`platform-picture-${status.id}`} source={{ uri: avatarUrl }}
          style={{ position: "absolute", right: -PEEK, bottom: -PEEK, width: PICTURE, height: PICTURE, borderRadius: theme.radius.pill, borderWidth: RING, borderColor: theme.screen.bar }} />
      ) : null}
    </View>
    <View style={{ flex: 1, gap: theme.space.xs }}>
      <Body weight="semi" muted={dim}>{label}</Body>
      {connected && name ? <Body muted numberOfLines={1} style={{ fontSize: theme.type.small }}>{name}</Body> : null}
      {detail ? <Body muted style={[{ fontSize: theme.type.label }, detail === "Sign-in expired" ? { color: theme.screen.dangerText } : null]}>{detail}</Body> : null}
    </View>
  </>);
}
