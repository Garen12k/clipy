import type { CollageLayoutId, PhotoMotionId } from "./model/types";
import type { IoniconName } from "./toolGroups";

/** The Motion tool's tiles (None comes first and is not listed here). */
export const PHOTO_MOTIONS: Record<PhotoMotionId, { label: string; icon: IoniconName }> = {
  zoomIn:     { label: "Zoom in",     icon: "expand-outline" },
  zoomOut:    { label: "Zoom out",    icon: "contract-outline" },
  panLeft:    { label: "Pan left",    icon: "arrow-back-outline" },
  panRight:   { label: "Pan right",   icon: "arrow-forward-outline" },
  panUp:      { label: "Pan up",      icon: "arrow-up-outline" },
  panDown:    { label: "Pan down",    icon: "arrow-down-outline" },
  zoomCorner: { label: "Corner zoom", icon: "scan-outline" },
};
/** The Collage panel's tiles: each draws its own layout, so a label is all it needs. */
export const COLLAGE_LAYOUTS: Record<CollageLayoutId, { label: string }> = {
  sideBySide: { label: "Side by side" }, stacked: { label: "Stacked" }, bigTwo: { label: "Big and two" },
  row3: { label: "Row of three" }, grid4: { label: "Grid of four" }, inset: { label: "Inset" },
};
/** What the Corner slider says at each of its three stops (`CollageCorner`). */
export const CORNER_LABELS = ["Square", "Rounded", "Round"] as const;
