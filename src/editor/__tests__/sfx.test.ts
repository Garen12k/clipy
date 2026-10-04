import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { SFX, SFX_IDS } from "../sfx";
import manifest from "../../../assets/sfx/manifest.json";

const SFX_DIR = path.resolve(__dirname, "../../../assets/sfx");
const SCRIPT = path.resolve(__dirname, "../../../scripts/generate-sfx.mjs");

interface Entry { id: string; label: string; file: string; durationSec: number }
const entries = (manifest as { sounds: Entry[] }).sounds;

function peakAndSamples(buf: Buffer) {
  let peak = 0;
  const n = buf.readUInt32LE(40) / 2;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf.readInt16LE(44 + i * 2)) / 32768);
  return { peak, samples: n };
}

describe("synthesized sound effects", () => {
  it("has the ten ids", () => {
    expect([...SFX_IDS].sort()).toEqual(
      ["beep", "chime", "click", "ding", "drop", "pop", "riser", "swoosh", "tick", "whoosh"],
    );
    expect(Object.keys(SFX).sort()).toEqual([...SFX_IDS].sort());
  });

  it("manifest and SFX agree", () => {
    expect(entries.map((e) => e.id).sort()).toEqual([...SFX_IDS].sort());
    for (const e of entries) {
      const s = SFX[e.id as keyof typeof SFX];
      expect(s.label).toBe(e.label);
      expect(s.durationSec).toBe(e.durationSec);
      expect(e.file).toBe(`${e.id}.wav`);
      expect(s.file).toBeDefined();
    }
  });

  it.each(entries.map((e) => [e.id, e] as const))("%s is a valid short WAV", (_id, e) => {
    const file = path.join(SFX_DIR, e.file);
    expect(fs.existsSync(file)).toBe(true);
    const buf = fs.readFileSync(file);
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
    expect(buf.toString("ascii", 12, 16)).toBe("fmt ");
    expect(buf.readUInt16LE(20)).toBe(1); // PCM
    expect(buf.readUInt16LE(22)).toBe(1); // mono
    expect(buf.readUInt32LE(24)).toBe(44100);
    expect(buf.readUInt16LE(34)).toBe(16);
    expect(buf.toString("ascii", 36, 40)).toBe("data");
    const { peak, samples } = peakAndSamples(buf);
    expect(Math.abs(samples / 44100 - e.durationSec)).toBeLessThanOrEqual(0.001);
    expect(e.durationSec).toBeLessThanOrEqual(1.6);
    expect(peak).toBeLessThanOrEqual(0.71);
    expect(peak).toBeGreaterThan(0.1);
  });

  it("re-running the generator reproduces the committed bytes", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "clipy-sfx-"));
    try {
      execFileSync(process.execPath, [SCRIPT, tmp]);
      for (const e of entries) {
        expect(fs.readFileSync(path.join(tmp, e.file)).equals(fs.readFileSync(path.join(SFX_DIR, e.file)))).toBe(true);
      }
      expect(fs.readFileSync(path.join(tmp, "manifest.json"), "utf8")).toBe(
        fs.readFileSync(path.join(SFX_DIR, "manifest.json"), "utf8"),
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
