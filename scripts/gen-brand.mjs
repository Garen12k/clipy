// Makes the PNGs app.json names from the owner's chosen icon, drawn at docs/design/icon/. Run: npm run gen:brand
// (The first icon's drawings stay at assets/brand/*.svg; nothing reads them any more.)
//
// - icon.png / icon-dark.png: the 1024 icon WITHOUT an alpha channel (Apple refuses an app icon that has one).
// - icon-tinted.png: the white glyph laid on BLACK. Expo's prebuild lays the tinted icon on solid white when it has any
//   see-through pixel (@expo/prebuild-config, withIosIcons: `backgroundColor: appearance !== 'dark' ? '#ffffff'`), which would
//   turn a white glyph on nothing into a blank white square.
// - splash-icon.png: the glyph on nothing, as drawn (the launch screen's colour is the splash plugin's `backgroundColor`).
import { copyFile } from "node:fs/promises";
import sharp from "sharp";

const FROM = "docs/design/icon";
const NAVY = "#0A1B33";

await sharp(`${FROM}/icon.png`).flatten({ background: NAVY }).removeAlpha().png().toFile("assets/icon.png");
await sharp(`${FROM}/icon-dark.png`).flatten({ background: NAVY }).removeAlpha().png().toFile("assets/icon-dark.png");
await sharp(`${FROM}/icon-tinted.png`).flatten({ background: "#000000" }).removeAlpha().png().toFile("assets/icon-tinted.png");
await copyFile(`${FROM}/splash-icon.png`, "assets/splash-icon.png");

for (const name of ["icon", "icon-dark", "icon-tinted"]) {
  const meta = await sharp(`assets/${name}.png`).metadata();
  if (meta.hasAlpha || meta.width !== 1024 || meta.height !== 1024) throw new Error(`assets/${name}.png must be 1024 x 1024 with no alpha`);
}
console.log("wrote assets/icon.png, icon-dark.png, icon-tinted.png, splash-icon.png");
