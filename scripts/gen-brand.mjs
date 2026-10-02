// Renders assets/brand/*.svg to the PNGs referenced by app.json. Run: npm run gen:brand
import { readFile } from "node:fs/promises";
import sharp from "sharp";

await sharp(await readFile("assets/brand/icon.svg")).resize(1024, 1024).flatten({ background: "#0A1B33" }).png().toFile("assets/icon.png");
await sharp(await readFile("assets/brand/splash.svg")).resize(1024, 1024).png().toFile("assets/splash-icon.png");
console.log("wrote assets/icon.png, assets/splash-icon.png");
