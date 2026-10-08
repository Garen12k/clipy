import type { EqId, Project, SoundSettings, VoiceId } from "./types";

/**
 * What a sound setting MEANS, as numbers for the native units. TypeScript only: the render request carries these numbers and the
 * Swift side only sets them (SoundRender.swift), so a voice is tuned here, without a native build. Raise SOUND_VERSION when a
 * table changes: copies rendered from the old numbers are then no longer used.
 */
export const SOUND_VERSION = 1;

/** The equaliser filter kinds a chain may name (`SoundRender.filterTypes` has exactly these keys). */
export const BAND_TYPES = ["parametric", "lowShelf", "highShelf", "highPass", "lowPass"] as const;
export type BandType = (typeof BAND_TYPES)[number];
/** AVAudioUnitReverbPreset case names (`SoundRender.reverbPresets` has exactly these keys). */
export const REVERB_PRESETS: readonly string[] = ["smallRoom", "mediumRoom", "largeRoom", "mediumHall", "largeHall", "plate", "mediumChamber", "largeChamber",
  "cathedral", "largeRoom2", "mediumHall2", "mediumHall3", "largeHall2", "outdoorGeneral"];
/** AVAudioUnitDistortionPreset case names (`SoundRender.distortionPresets` has exactly these keys). */
export const DISTORTION_PRESETS: readonly string[] = ["drumsBitBrush", "drumsBufferBeats", "drumsLoFi", "multiBrokenSpeaker", "multiCellphoneConcert", "multiDecimated1", "multiDecimated2",
  "multiDecimated3", "multiDecimated4", "multiDistortedFunk", "multiDistortedCubed", "multiDistortedSquared", "multiEcho1", "multiEcho2", "multiEchoTight1", "multiEchoTight2",
  "multiEverythingIsBroken", "speechAlienChatter", "speechCosmicInterference", "speechGoldenPi", "speechRadioTower", "speechWaves"];

/** One equaliser band: Hz, dB, octaves (a shelf and a pass filter ignore the bandwidth). */
export interface SoundBand { type: BandType; frequency: number; gain: number; bandwidth: number }
/**
 * The units of one render and their values. A unit is left out when its switch is off: pitch 0, a wet mix of 0 or an empty preset
 * name, no bands. `level` = Even out loudness (measured inside the render). `noiseWet` = Reduce noise, off at 0.
 */
export interface SoundChain {
  pitchCents: number;
  distortionPreset: string; distortionWet: number; distortionPreGain: number;
  delayTime: number; delayFeedback: number; delayWet: number; delayLowPass: number;
  reverbPreset: string; reverbWet: number;
  bands: SoundBand[];
  level: boolean;
  /** Reduce noise: the isolation unit's wet / dry mix in percent, first in the chain. 0 = no unit. */
  noiseWet: number;
}
/** AVAudioUnitTimePitch.pitch runs −2400 … 2400 cents. */
export const PITCH_CENTS_LIMIT = 2400;

/** `[at strength 0, at strength 1]`; in between is a straight line. */
type Range = readonly [number, number];
interface VoiceRow {
  pitch: Range;                                                                          // cents
  distortion?: { preset: string; wet: Range; preGain: number };                          // %, dB
  delay?: { time: Range; feedback: Range; wet: Range; lowPass: number };                 // s, %, %, Hz
  reverb?: { preset: string; wet: Range };                                               // %
  bands?: readonly { type: BandType; frequency: Range; gain: Range; bandwidth: number }[];
}
const STILL: Range = [0, 0];
export const VOICE_TABLE: Record<VoiceId, VoiceRow> = {
  deep: { pitch: [-200, -700] },
  high: { pitch: [200, 600] },
  chipmunk: { pitch: [700, 1200] },
  // No vocoder: a 12 ms feedback delay rings like metal, with a slight drop in pitch and a little of Apple's speech distortion.
  robot: { pitch: [-100, -300], delay: { time: [0.012, 0.012], feedback: [55, 85], wet: [35, 70], lowPass: 8000 }, distortion: { preset: "speechCosmicInterference", wet: [8, 30], preGain: -6 } },
  echo: { pitch: STILL, delay: { time: [0.22, 0.38], feedback: [25, 55], wet: [20, 50], lowPass: 6000 } },
  hall: { pitch: STILL, reverb: { preset: "largeHall", wet: [15, 60] } },
  telephone: { pitch: STILL, bands: [
    { type: "highPass", frequency: [200, 500], gain: STILL, bandwidth: 1 },
    { type: "lowPass", frequency: [5000, 2600], gain: STILL, bandwidth: 1 },
    { type: "parametric", frequency: [1800, 1800], gain: [2, 8], bandwidth: 1 },
  ] },
};
export const EQ_TABLE: Record<EqId, readonly SoundBand[]> = {
  bassBoost: [{ type: "lowShelf", frequency: 110, gain: 6, bandwidth: 1 }, { type: "parametric", frequency: 250, gain: -1.5, bandwidth: 1 }],
  clearVoice: [{ type: "highPass", frequency: 90, gain: 0, bandwidth: 1 }, { type: "parametric", frequency: 300, gain: -3, bandwidth: 1 },
    { type: "parametric", frequency: 3200, gain: 4, bandwidth: 1.2 }, { type: "highShelf", frequency: 9000, gain: 2, bandwidth: 1 }],
  warm: [{ type: "lowShelf", frequency: 200, gain: 3, bandwidth: 1 }, { type: "parametric", frequency: 3500, gain: -2, bandwidth: 1.5 }, { type: "highShelf", frequency: 8000, gain: -3, bandwidth: 1 }],
  bright: [{ type: "parametric", frequency: 3000, gain: 2, bandwidth: 1 }, { type: "highShelf", frequency: 6500, gain: 5, bandwidth: 1 }],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** The value of a range at strength `s`, to 3 decimals. */
const at = (r: Range, s: number): number => Math.round((r[0] + (r[1] - r[0]) * s) * 1000) / 1000;

// A setting as the chain AND the file name read it, so a name always stands for exactly one chain. An id that is not a row of its
// table is none; a strength or pitch that is not a number is 0.
const has = (table: object, id: unknown): boolean => typeof id === "string" && Object.prototype.hasOwnProperty.call(table, id);
const voiceOf = (s: SoundSettings): VoiceId | null => (has(VOICE_TABLE, s.voice) ? s.voice : null);
const eqOf = (s: SoundSettings): EqId | null => (has(EQ_TABLE, s.eq) ? s.eq : null);
const strengthOf = (s: SoundSettings): number => clamp(Number.isFinite(s.strength) ? s.strength : 0, 0, 1);
/** Whole semitones; + 0: a rounded −0 is 0. */
const pitchOf = (s: SoundSettings): number => (Number.isFinite(s.pitch) ? Math.round(s.pitch) + 0 : 0);
/** The noise strength of a setting, or null when Reduce noise is off (no key, or not a number). */
const noiseOf = (s: SoundSettings): number | null => (typeof s.noise === "number" && Number.isFinite(s.noise) ? clamp(s.noise, 0, 1) : null);
/**
 * Reduce noise, strength 0 … 1 → the unit's wet / dry mix in percent. The mix is a straight blend, so what is left of the noise is
 * `1 − wet`: 50 % (−6 dB) at the lightest, 87.5 % (−18 dB) in the middle, 100 % (the isolated voice alone) at the strongest —
 * a curve, so equal slider steps sound like equal steps.
 */
export function noiseWet(strength: number): number {
  const k = Number.isFinite(strength) ? clamp(strength, 0, 1) : 0;
  return Math.round((100 - 50 * (1 - k) * (1 - k)) * 1000) / 1000;
}

/** The units and numbers of a setting. A setting that changes nothing gives a chain that switches every unit off. */
export function soundChain(s: SoundSettings): SoundChain {
  const voice = voiceOf(s), eq = eqOf(s);
  const row = voice ? VOICE_TABLE[voice] : null;
  const k = strengthOf(s);
  const noise = noiseOf(s);
  const voiceBands: SoundBand[] = (row?.bands ?? []).map((b) => ({ type: b.type, frequency: at(b.frequency, k), gain: at(b.gain, k), bandwidth: b.bandwidth }));
  const eqBands: SoundBand[] = (eq ? EQ_TABLE[eq] : []).map((b) => ({ ...b }));
  return {
    pitchCents: clamp(Math.round(row ? at(row.pitch, k) : 0) + pitchOf(s) * 100, -PITCH_CENTS_LIMIT, PITCH_CENTS_LIMIT) + 0,
    distortionPreset: row?.distortion?.preset ?? "", distortionWet: row?.distortion ? at(row.distortion.wet, k) : 0, distortionPreGain: row?.distortion?.preGain ?? -6,
    delayTime: row?.delay ? at(row.delay.time, k) : 0, delayFeedback: row?.delay ? at(row.delay.feedback, k) : 0, delayWet: row?.delay ? at(row.delay.wet, k) : 0, delayLowPass: row?.delay?.lowPass ?? 15000,
    reverbPreset: row?.reverb?.preset ?? "", reverbWet: row?.reverb ? at(row.reverb.wet, k) : 0,
    bands: [...voiceBands, ...eqBands],
    level: s.level === true,
    noiseWet: noise === null ? 0 : noiseWet(noise),
  };
}

const stemOf = (uri: string): string => (uri.split("/").pop() ?? "").replace(/\.[A-Za-z0-9]+$/, "").replace(/[^A-Za-z0-9_-]/g, "_");
/**
 * The file a setting's copy of a source is kept in: the source's name and the setting, so the same pair is rendered once and found
 * again. Without a voice the strength does not count. Example: `abc-v1-deep-s50-pm3-warm-l1.m4a`.
 * With Reduce noise on the name ends `-n<strength %>`: `abc-v1-plain-s0-p0-flat-l0-n50.m4a`.
 */
export function soundFileName(sourceUri: string, s: SoundSettings): string {
  const voice = voiceOf(s), semitones = pitchOf(s);
  const strength = voice ? Math.round(strengthOf(s) * 100) : 0;
  const pitch = `p${semitones < 0 ? "m" : ""}${Math.abs(semitones)}`;
  const noise = noiseOf(s);
  // The noise part is there only when Reduce noise is on: a setting without it keeps the name it always had.
  const tail = noise === null ? "" : `-n${Math.round(noise * 100)}`;
  return `${stemOf(String(sourceUri))}-v${SOUND_VERSION}-${voice ?? "plain"}-s${strength}-${pitch}-${eqOf(s) ?? "flat"}-l${s.level === true ? 1 : 0}${tail}.m4a`;
}

/** One copy the project plays: its file name, the source it is rendered from and the setting. */
export interface NeededSound { name: string; sourceUri: string; sound: SoundSettings }
/** Every different copy the project's tracks need, in track order. A track as recorded needs none; a track whose file is missing is left out. */
export function neededSounds(p: Project, missing: readonly string[] = []): NeededSound[] {
  const out: NeededSound[] = [];
  for (const t of p.audioTracks) {
    if (!t.sound || missing.includes(t.sourceUri)) continue;
    const name = soundFileName(t.sourceUri, t.sound);
    if (!out.some((n) => n.name === name)) out.push({ name, sourceUri: t.sourceUri, sound: t.sound });
  }
  return out;
}
