import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync("node_modules/unicode-emoji-json/data-by-emoji.json", "utf8"));
const out = Object.entries(data).map(([char, v]) => ({
  char,
  name: v.name,
  keywords: Array.from(new Set([v.group, v.slug.replace(/_/g, " "), ...v.name.split(/\s+/)])).map((k) => k.toLowerCase()),
}));
writeFileSync("assets/emoji.json", JSON.stringify(out));
console.log(`wrote ${out.length} emoji`);
