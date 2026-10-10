import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";
import { FONTS } from "@/src/editor/fonts";
import { clipGainCurve, exportTrackCurve, type GainPoint } from "@/src/editor/model/audioMix";
import { trackEnd } from "@/src/editor/model/audioSync";
import { edgeDurations, photoMotionPins } from "@/src/editor/model/motion";
import type { SoundChain } from "@/src/editor/model/sound";
import { clipDuration, hasSpeedCurve, outputOffsetOf, playbackSpans } from "@/src/editor/model/timeline";
import { clampTextStyle, DEFAULT_TEXT_STYLE, isRegionEffect, isSticker, type AnimEdge, type Align, type AspectRatio, type AudioTrack, type BlendId, type BoxCorner, type Clip, type ClipAdjust, type ClipTransform, type CropRect, type EffectItem, type ExportFps, type Keyframe, type LayerClip, type MaskId, type Overlay, type Project, type TextStyle } from "@/src/editor/model/types";
import type { Resolution } from "@/src/export/estimate";

export type ExportEvent = { jobId: string } & (
  | { type: "progress"; progress: number }
  | { type: "done"; fileUri: string }
  | { type: "error"; message: string; /** `EXPORT_INTERRUPTED` when the app was in the background during the export (the "background export" build); absent for a failure. */ code?: string }
  | { type: "cancelled" });

export interface ExportAnimEdge { id: string; duration: number }
/** `duration` source seconds played at `speed`. */
export interface ExportSpeedSpan { duration: number; speed: number }
export interface ExportKeyframe { t: number; x: number; y: number; scale: number; rotation: number; opacity: number }
const copyKeyframe = (k: Keyframe): ExportKeyframe => ({ t: k.t, x: k.x, y: k.y, scale: k.scale, rotation: k.rotation, opacity: k.opacity });
const toEdge = (e: AnimEdge | null, duration: number): ExportAnimEdge | null => (e && duration > 0 ? { id: e.id, duration } : null);

/** `TextStyle` as the native record has it: shadow / glow flattened, a null colour = that feature is off (its numbers are 0); the box fields are the background box's padding and corner. */
export interface ExportTextStyle {
  opacity: number; letterSpacing: number; lineSpacing: number; outlineColor: string | null; outlineWidth: number;
  shadowColor: string | null; shadowOpacity: number; shadowDistance: number; shadowBlur: number;
  glowColor: string | null; glowSize: number;
  boxPadding: number; boxCorner: BoxCorner;      // the background box: padding as a fraction of the font size; "rounded" | "square"
}
export interface ExportCaptionWord { text: string; start: number; end: number }   // seconds since the caption's start
/** The box fields go through the model's clamp, so they are always a number in range and a known corner: the native record cannot decode a `null`. */
const toExportStyle = (s: TextStyle, box: TextStyle = clampTextStyle(s)): ExportTextStyle => ({
  opacity: s.opacity, letterSpacing: s.letterSpacing, lineSpacing: s.lineSpacing, outlineColor: s.outlineColor, outlineWidth: s.outlineWidth,
  shadowColor: s.shadow?.color ?? null, shadowOpacity: s.shadow?.opacity ?? 0, shadowDistance: s.shadow?.distance ?? 0, shadowBlur: s.shadow?.blur ?? 0,
  glowColor: s.glow?.color ?? null, glowSize: s.glow?.size ?? 0, boxPadding: box.boxPadding, boxCorner: box.boxCorner,
});

export interface ExportOverlay {
  kind: "text" | "caption" | "sticker";
  text: string; fontPostScriptName: string; fontScale: number; color: string;
  backgroundColor: string | null; backgroundOpacity: number; outline: boolean; align: Align;
  emoji: string | null; shape: string | null;
  x: number; y: number; scale: number; rotation: number; start: number; end: number;
  animIn: ExportAnimEdge | null; animOut: ExportAnimEdge | null; animLoop: string | null; keyframes: ExportKeyframe[];
  style: ExportTextStyle;
  words: ExportCaptionWord[];      // captions only; [] otherwise
  highlightColor: string | null;   // captions only; null = no word highlight
}
/** One breakpoint of a piecewise-linear gain curve (`audioMix.ts`); the native side only draws ramps between them. */
export type ExportGainPoint = GainPoint;
/**
 * One audio track as the export plays it: source `[trimStart, trimEnd)` inserted at `start` (composition seconds), already
 * clipped to the exported video; `gain` is in composition seconds and includes volume, fades, ducking and the end-of-video fade.
 */
export interface ExportAudioTrack { sourceUri: string; start: number; trimStart: number; trimEnd: number; gain: ExportGainPoint[] }
/** The track clipped to a video `total` seconds long, or null when nothing of it is inside (the gain maths is `exportTrackCurve`). */
export function toExportAudioTrack(p: Project, t: AudioTrack, total: number): ExportAudioTrack | null {
  const gain = exportTrackCurve(p, t, total);
  if (gain.length < 2) return null;
  const early = Math.max(0, -t.start);   // seconds of the track before the video starts
  return {
    sourceUri: t.sourceUri, start: early > 0 ? 0 : t.start, trimStart: t.trimStart + early,
    trimEnd: trackEnd(t) > total ? t.trimStart + (total - t.start) : t.trimEnd,
    gain,
  };
}
export interface ExportClip {
  sourceUri: string; trimStart: number; trimEnd: number; volume: number; muted: boolean;
  speed: number; filter: string | null; transition: { type: string; duration: number };
  kind: "video" | "photo"; sourceWidth: number; sourceHeight: number;
  transform: ClipTransform; crop: CropRect;
  background: { type: "black" | "color" | "blur"; color: string | null };
  reversed: boolean;
  filterIntensity: number; adjust: ClipAdjust;
  animIn: ExportAnimEdge | null; animOut: ExportAnimEdge | null; animCombo: string | null;
  keyframes: ExportKeyframe[];   // clip-local OUTPUT seconds, ascending; the pins inside the clip plus the nearest one each side
  speedSpans: ExportSpeedSpan[]; // a speed curve as constant-speed spans in PLAYBACK order; [] = constant speed (`speed`)
  gain: ExportGainPoint[];       // the clip's own sound: clip-local OUTPUT seconds; volume, mute and fades included (the export mixes with this)
  opacity: number;               // the clip's STATIC opacity 0–1; keyframe opacity travels in `keyframes` and the native side multiplies the two
  mask: MaskId;
  blend: BlendId;                // how the clip composites over what is beneath it; main clips are always "normal"
  chroma: { color: string; strength: number } | null;   // green-screen key; null = none
  /**
   * The file a main clip's Blur background is made from when that is not the clip's own picture: the ORIGINAL of a clip sent from
   * its see-through cut-out copy (`withCutout`), read with the clip's own timing. ABSENT for every other clip (never null) — and
   * on a build from before it (`isBlurAndCutsBuild`), which would ignore it.
   */
  backdrop?: { uri: string; kind: "video" | "photo" };
}
/** A layer as the export draws it: a clip placed on the timeline at `start` (composition seconds). */
export type ExportLayer = ExportClip & { start: number };
/** Pins converted to output-local seconds, sorted, trimmed to [0, length] plus the last one before 0 and the first one after length. */
function outputKeyframes(c: Clip, length: number): ExportKeyframe[] {
  const pins = c.keyframes.map((k) => ({ ...copyKeyframe(k), t: outputOffsetOf(c, k.t) })).sort((a, b) => a.t - b.t);
  const before = pins.filter((k) => k.t < 0);
  const inside = pins.filter((k) => k.t >= 0 && k.t <= length);
  const after = pins.find((k) => k.t > length);
  return [...before.slice(-1), ...inside, ...(after ? [after] : [])];
}
export function toExportClip(c: Clip): ExportClip {
  const length = clipDuration(c);   // not sent: the export takes the clip's length from its composition
  const edges = edgeDurations(c.animation.in?.duration ?? 0, c.animation.out?.duration ?? 0, length);
  return {
    sourceUri: c.sourceUri, trimStart: c.trimStart, trimEnd: c.trimEnd, volume: c.volume, muted: c.muted,
    speed: c.speed, filter: c.filter, transition: { type: c.transitionOut.type, duration: c.transitionOut.duration },
    kind: c.kind, sourceWidth: c.width, sourceHeight: c.height,
    transform: { ...c.transform }, crop: { ...c.crop },
    background: { type: c.background.type, color: c.background.type === "color" ? c.background.color : null },
    reversed: c.reversed,
    filterIntensity: c.filterIntensity, adjust: { ...c.adjust },
    animIn: toEdge(c.animation.in, edges.in), animOut: toEdge(c.animation.out, edges.out), animCombo: c.animation.combo,
    // A photo's Motion travels as two pins (it eases the way pins are interpolated): the native side needs nothing new.
    keyframes: photoMotionPins(c, length) ?? outputKeyframes(c, length),
    speedSpans: hasSpeedCurve(c) ? playbackSpans(c) : [],
    gain: clipGainCurve(c),
    opacity: c.opacity, mask: c.mask,
    // Only a layer has a blend mode (`toExportLayer` sends it); a main clip is sent as normal whatever the project holds.
    blend: "normal", chroma: c.chroma ? { color: c.chroma.color, strength: c.chroma.strength } : null,
  };
}
/** A layer has no transition or background of its own (both are ignored by the native side), so they are sent neutral. */
export function toExportLayer(l: LayerClip): ExportLayer {
  return { ...toExportClip(l), start: l.start, transition: { type: "none", duration: 0 }, background: { type: "black", color: null }, blend: l.blend };
}
export interface ExportEffect { type: string; start: number; end: number; intensity: number; rect: { x: number; y: number; w: number; h: number } | null }
/** The rectangle is sent only for a blur / mosaic box, whatever the project holds. */
export function toExportEffect(e: EffectItem): ExportEffect {
  return { type: e.type, start: e.start, end: e.end, intensity: e.intensity, rect: isRegionEffect(e.type) && e.rect ? { ...e.rect } : null };
}
export interface ExportRequest {
  clips: ExportClip[];
  layers: ExportLayer[];   // drawn in list order (later = on top)
  overlays: ExportOverlay[];
  effects: ExportEffect[];
  audioTracks: ExportAudioTrack[];
  aspectRatio: AspectRatio;   // "auto" or a "w:h" id; a "w:h" id decides the frame's shape by itself
  frameAspect: number;        // the frame's width / height (`frameAspect(project)`), finite and > 0; what "auto" exports with
  resolution: Resolution;
  fps: ExportFps;      // frames per second of the exported video
  bitrate: number;     // `requestBitrate`: 0 = no file-length limit (High, the default); above 0 = the video bits per second the file may use (Smaller file)
  outputPath: string;
}
function overlayMotion(o: Overlay): Pick<ExportOverlay, "animIn" | "animOut" | "animLoop" | "keyframes"> {
  const edges = edgeDurations(o.animation.in?.duration ?? 0, o.animation.out?.duration ?? 0, o.end - o.start);
  return { animIn: toEdge(o.animation.in, edges.in), animOut: toEdge(o.animation.out, edges.out), animLoop: o.animation.loop, keyframes: o.keyframes.map(copyKeyframe) };
}
export function toExportOverlay(o: Overlay): ExportOverlay {
  const shared = { x: o.x, y: o.y, scale: o.scale, rotation: o.rotation, start: o.start, end: o.end };
  // Captions never animate or carry pins.
  const motion = o.kind === "caption" ? { animIn: null, animOut: null, animLoop: null, keyframes: [] } : overlayMotion(o);
  if (isSticker(o)) {
    return {
      kind: "sticker", text: "", fontPostScriptName: "", fontScale: 0, color: o.color,
      backgroundColor: null, backgroundOpacity: 0, outline: false, align: "center",
      emoji: o.emoji, shape: o.shape, ...shared, ...motion,
      style: toExportStyle(DEFAULT_TEXT_STYLE), words: [], highlightColor: null,
    };
  }
  return {
    kind: o.kind, text: o.text, fontPostScriptName: FONTS[o.fontId].postScriptName, fontScale: o.fontScale, color: o.color,
    backgroundColor: o.background?.color ?? null, backgroundOpacity: o.background?.opacity ?? 0, outline: o.outline, align: o.align,
    emoji: null, shape: null, ...shared, ...motion,
    style: toExportStyle(o.style),
    // Only captions have spoken words and a highlight.
    words: o.kind === "caption" ? o.words.map((w) => ({ text: w.text, start: w.start, end: w.end })) : [],
    highlightColor: o.kind === "caption" ? o.highlightColor : null,
  };
}

// `NativeModule<TEventsMap>` from `expo-modules-core` resolves to the class's constructor
// type (not its instance type) in this SDK 57 build, so `addListener` is missing from it.
// Declaring `addListener` ourselves avoids relying on that broken generic.
export interface TranscriptSegment { text: string; start: number; end: number }

/** One render: the units' numbers (`soundChain` in src/editor/model/sound.ts), the file to read and the file to write. `jobId` is the caller's, so a render can be cancelled before it answers. */
export interface SoundRenderRequest extends SoundChain { jobId: string; sourceUri: string; outputPath: string }
/** `seconds` = the length of the copy (the source's); `gainDb` = what Even out loudness applied (0 when it is off). */
export interface SoundRenderResult { fileUri: string; seconds: number; gainDb: number }
export type SoundEvent = { jobId: string; progress: number };
export interface SoundInfo { hasSound: boolean; seconds: number }
/** The answer of the noise-reduction test: whether Apple's sound isolation unit rendered a saved recording, the stage it reached and what it reported. */
export interface NoiseProbe { ok: boolean; stage: string; detail: string }
/** One installed voice. `languageName` is the language in the phone's own language; `quality` is Apple's raw value (1 default, 2 enhanced, 3 premium). */
export interface SpeechVoice { id: string; name: string; language: string; languageName: string; quality: number }
/** `current` = the phone's language code (BCP 47), to start the picker on. */
export interface SpeechVoices { current: string; voices: SpeechVoice[] }
/** One Read aloud: the text as it is spoken, the voice, the rate (0 … 1, 0.5 = the system's normal pace) and the file to write. */
export interface SpeechRequest { jobId: string; text: string; voiceId: string; rate: number; outputPath: string }
export interface SpeechResult { fileUri: string; seconds: number }
/** The code a cancelled Read aloud rejects with. */
export const SPEECH_CANCELLED = "E_READ_ALOUD_CANCELLED";
/** One Find beats for a file of the owner's: the seconds of the file to listen to (`to` at or before `from` = to the end). */
export interface BeatEnvelopeRequest { jobId: string; sourceUri: string; from: number; to: number }
/** The onset envelope of that stretch (`onsetEnvelope` in src/editor/model/beatDetect.ts): `rate` values a second, `seconds` of sound decoded, starting at `from` in the file. */
export interface BeatEnvelopeResult { env: number[]; rate: number; seconds: number; from: number }
/** The code a cancelled Find beats rejects with. */
export const BEATS_CANCELLED = "E_BEATS_CANCELLED";
/**
 * One cut-out copy (the numbers are `CUTOUT` in src/editor/model/cutout.ts). Video: the source range `from` … `to` is written to
 * `outputPath` (a .mov with a see-through background, the source's timing and sound). Photo: `outputPath` is a PNG and `stillPath`
 * a `stillSeconds` long movie of the same picture.
 */
export interface CutoutRequest {
  jobId: string; sourceUri: string; outputPath: string; kind: "video" | "photo"; from: number; to: number;
  maxSide: number; minFrameGap: number; minPerson: number; alphaQuality: number; bitsPerPixel: number; stillPath: string; stillSeconds: number;
}
/** `person` = the largest share of a measured frame the people mask covered (0 … 1). */
export interface CutoutResult { fileUri: string; seconds: number; frames: number; person: number }
export type CutoutEvent = { jobId: string; progress: number };
/** The code a cancelled cut-out render rejects with. */
export const CUTOUT_CANCELLED = "E_CUTOUT_CANCELLED";
/** One measuring for Stabilize: the source seconds to read, how close two measured frames may be, and the long side of the picture Vision is shown. */
export interface ShakeRequest {
  jobId: string; sourceUri: string; from: number; to: number;
  minFrameGap: number; measureSide: number;
}
/**
 * Per measured frame, in order: its source second and how far Vision says it must move to sit on the frame before it, as fractions
 * of the picture's width (`dx`) and height (`dy`), exactly as Vision reported them (`steadyShifts` in steadyPath.ts decides what
 * they mean). `failed` = frames Vision could not place (reported as 0, 0).
 */
export interface ShakeResult { times: number[]; dx: number[]; dy: number[]; frames: number; failed: number }
/**
 * One steadied and / or filled copy (the numbers are `STEADY` / `SMOOTH` in src/editor/model/steady.ts): the source range `from` …
 * `to` written to `outputPath`, a .mov with the source's timing and sound. `times` / `dx` / `dy`: the correction of each frame
 * (fractions of the picture; empty = none), `zoom` the fixed zoom. `grid`: 0 = the source's own frames; above 0 = that many frames
 * per source second, the ones in between blended.
 */
export interface SteadyRequest {
  jobId: string; sourceUri: string; outputPath: string; from: number; to: number;
  maxSide: number; minFrameGap: number; grid: number; zoom: number;
  times: number[]; dx: number[]; dy: number[];
  bitRate: number; blendFloor: number;
  /** Two neighbouring frames more different than this (`SMOOTH.cutDifference`) are a cut and get no blended frames. Absent or 0 = never asked; a build from before it ignores it. */
  cutDifference?: number;
}
/** `cuts` / `apart` (a build that knows `cutDifference`, a copy with a grid): the pairs left unblended as cuts, and the largest difference measured between two neighbours. */
export interface SteadyResult { fileUri: string; seconds: number; frames: number; cuts?: number; apart?: number }
export type SteadyEvent = { jobId: string; progress: number };
/** The code a cancelled measuring or steady render rejects with. */
export const STEADY_CANCELLED = "E_STEADY_CANCELLED";
/** The code a cancelled render rejects with. */
export const SOUND_CANCELLED = "E_SOUND_CANCELLED";
/**
 * One waveform for a timeline bar: the seconds of the file to look at (`to` at or before `from` = to the end) and how many values
 * to answer with (the phone clamps it to 16 … 2000). `jobId` is the caller's, so it can be cancelled before it answers.
 */
export interface SoundPeaksRequest { jobId: string; uri: string; from: number; to: number; count: number }
/** `peaks`: per equal slice of `from` … `to` (the stretch actually read, clamped to the file), the largest |sample| of the mono mix, 0 … 1. */
export interface SoundPeaksResult { peaks: number[]; from: number; to: number }
/** The code a cancelled waveform rejects with. */
export const PEAKS_CANCELLED = "E_PEAKS_CANCELLED";

type ClipyVideoNative = {
  hello(): string;
  exportTimeline(req: ExportRequest): Promise<string>;
  cancelExport(jobId: string): void;
  addListener(eventName: "onExportEvent", listener: (e: ExportEvent) => void): EventSubscription;
  transcribe(uri: string, trimStart: number, trimEnd: number): Promise<TranscriptSegment[]>;
  cancelTranscribe(): void;
  addListener(eventName: "onSoundEvent", listener: (e: SoundEvent) => void): EventSubscription;
  renderSound(req: SoundRenderRequest): Promise<SoundRenderResult>;
  cancelSoundRender(jobId: string): void;
  soundInfo(uri: string): Promise<SoundInfo>;
  probeNoiseReduction(uri: string): Promise<NoiseProbe>;
  noiseAvailable(): boolean;
  listVoices(): Promise<SpeechVoices>;
  speakToFile(req: SpeechRequest): Promise<SpeechResult>;
  cancelSpeech(jobId: string): void;
  beatEnvelope(req: BeatEnvelopeRequest): Promise<BeatEnvelopeResult>;
  cancelBeatEnvelope(jobId: string): void;
  addListener(eventName: "onCutoutEvent", listener: (e: CutoutEvent) => void): EventSubscription;
  renderCutout(req: CutoutRequest): Promise<CutoutResult>;
  cancelCutout(jobId: string): void;
  addListener(eventName: "onSteadyEvent", listener: (e: SteadyEvent) => void): EventSubscription;
  measureShake(req: ShakeRequest): Promise<ShakeResult>;
  renderSteady(req: SteadyRequest): Promise<SteadyResult>;
  cancelSteady(jobId: string): void;
  blurAndCuts(): boolean;
  soundPeaks(req: SoundPeaksRequest): Promise<SoundPeaksResult>;
  cancelSoundPeaks(jobId: string): void;
};

const NO_SOUND = "This build of the app has no sound tools yet. Install a newer development build.";
const NOT_LINKED = "ClipyVideo native module is not linked. Use a development build (eas build --profile development), not Expo Go.";

function optional(): ClipyVideoNative | null { return requireOptionalNativeModule<ClipyVideoNative>("ClipyVideo"); }
function native(): ClipyVideoNative { const m = optional(); if (!m) throw new Error(NOT_LINKED); return m; }

export function isNativeAvailable(): boolean { return optional() !== null; }
// The "background export" build: what the phone supports, the keep-alive around an export, the interruption code (background.ts).
export * from "./background";
/** Returns a greeting from the Swift module. Phase 0 smoke test only. */
export function hello(): string { return native().hello(); }
export function exportTimeline(req: ExportRequest): Promise<string> { return native().exportTimeline(req); }
export function cancelExport(jobId: string): void { native().cancelExport(jobId); }
export function addExportListener(cb: (e: ExportEvent) => void): EventSubscription { return native().addListener("onExportEvent", cb); }
export function transcribe(uri: string, trimStart: number, trimEnd: number): Promise<TranscriptSegment[]> { return native().transcribe(uri, trimStart, trimEnd); }
export function cancelTranscribe(): void { native().cancelTranscribe(); }

/** The module for a sound call: missing = not linked (Expo Go); present but without the function = a build from before the sound tools. */
function soundNative(fn: "renderSound" | "cancelSoundRender" | "soundInfo" | "probeNoiseReduction"): ClipyVideoNative {
  const m = native();
  if (typeof m[fn] !== "function") throw new Error(NO_SOUND);
  return m;
}
/** Whether the linked native module can render sound: false in Expo Go and in a build made before the sound tools. */
export function isSoundAvailable(): boolean { return typeof optional()?.renderSound === "function"; }
export function renderSound(req: SoundRenderRequest): Promise<SoundRenderResult> { return soundNative("renderSound").renderSound(req); }
export function cancelSoundRender(jobId: string): void { soundNative("cancelSoundRender").cancelSoundRender(jobId); }
export function addSoundListener(cb: (e: SoundEvent) => void): EventSubscription { return native().addListener("onSoundEvent", cb); }
export function soundInfo(uri: string): Promise<SoundInfo> { return soundNative("soundInfo").soundInfo(uri); }
export function probeNoiseReduction(uri: string): Promise<NoiseProbe> { return soundNative("probeNoiseReduction").probeNoiseReduction(uri); }
/** True for the rejection of a render that was cancelled (`cancelSoundRender`). */
export function isSoundCancelled(e: unknown): boolean { return typeof e === "object" && e !== null && (e as { code?: unknown }).code === SOUND_CANCELLED; }

const NOT_IN_BUILD = "This build of the app cannot do that yet. Install the latest Clipy build.";
/** The module for a call that came with the build of 2026-10-08: missing = not linked (Expo Go); present but without the function = an older build. */
function latestNative(fn: "listVoices" | "speakToFile" | "cancelSpeech"): ClipyVideoNative {
  const m = native();
  if (typeof m[fn] !== "function") throw new Error(NOT_IN_BUILD);
  return m;
}
/** Whether the linked native module can read a text aloud: false in Expo Go and in a build made before Read aloud. */
export function isSpeechAvailable(): boolean { return typeof optional()?.speakToFile === "function"; }
/** Whether the linked native module knows Reduce noise at all (a build made before it would ignore the request's noise number). */
export function isNoiseBuild(): boolean { return typeof optional()?.noiseAvailable === "function"; }
/** Whether Reduce noise can run: the build knows it AND this iPhone has Apple's sound isolation unit. Never throws. */
export function isNoiseAvailable(): boolean {
  try {
    const m = optional();
    return !!m && typeof m.noiseAvailable === "function" && m.noiseAvailable() === true;
  } catch { return false; }
}
export function listVoices(): Promise<SpeechVoices> { return latestNative("listVoices").listVoices(); }
export function speakToFile(req: SpeechRequest): Promise<SpeechResult> { return latestNative("speakToFile").speakToFile(req); }
export function cancelSpeech(jobId: string): void { latestNative("cancelSpeech").cancelSpeech(jobId); }
/** True for the rejection of a Read aloud that was cancelled (`cancelSpeech`). */
export function isSpeechCancelled(e: unknown): boolean { return typeof e === "object" && e !== null && (e as { code?: unknown }).code === SPEECH_CANCELLED; }

/** The module for a call that came with the build of 2026-10-09: missing = not linked (Expo Go); present but without the function = an older build. */
function batchNative(fn: "beatEnvelope" | "cancelBeatEnvelope" | "renderCutout" | "cancelCutout"): ClipyVideoNative {
  const m = native();
  if (typeof m[fn] !== "function") throw new Error(NOT_IN_BUILD);
  return m;
}
/** Whether the linked native module can listen to a file for its beats: false in Expo Go and in a build made before this. */
export function isBeatEnvelopeAvailable(): boolean { return typeof optional()?.beatEnvelope === "function"; }
export function beatEnvelope(req: BeatEnvelopeRequest): Promise<BeatEnvelopeResult> { return batchNative("beatEnvelope").beatEnvelope(req); }
export function cancelBeatEnvelope(jobId: string): void { batchNative("cancelBeatEnvelope").cancelBeatEnvelope(jobId); }
/** True for the rejection of a Find beats that was cancelled (`cancelBeatEnvelope`). */
export function isBeatsCancelled(e: unknown): boolean { return typeof e === "object" && e !== null && (e as { code?: unknown }).code === BEATS_CANCELLED; }
/** Whether the linked native module can remove a background: false in Expo Go and in a build made before this. */
export function isCutoutAvailable(): boolean { return typeof optional()?.renderCutout === "function"; }
export function renderCutout(req: CutoutRequest): Promise<CutoutResult> { return batchNative("renderCutout").renderCutout(req); }
export function cancelCutout(jobId: string): void { batchNative("cancelCutout").cancelCutout(jobId); }
export function addCutoutListener(cb: (e: CutoutEvent) => void): EventSubscription { return native().addListener("onCutoutEvent", cb); }
/** True for the rejection of a cut-out render that was cancelled (`cancelCutout`). */
export function isCutoutCancelled(e: unknown): boolean { return typeof e === "object" && e !== null && (e as { code?: unknown }).code === CUTOUT_CANCELLED; }

/** The module for a call that came with the build of 2026-10-10: missing = not linked (Expo Go); present but without the function = an older build. */
function steadyNative(fn: "measureShake" | "renderSteady" | "cancelSteady"): ClipyVideoNative {
  const m = native();
  if (typeof m[fn] !== "function") throw new Error(NOT_IN_BUILD);
  return m;
}
/** Whether the linked native module can stabilize and smooth slow motion: false in Expo Go and in a build made before this. */
export function isSteadyAvailable(): boolean { return typeof optional()?.renderSteady === "function"; }
export function measureShake(req: ShakeRequest): Promise<ShakeResult> { return steadyNative("measureShake").measureShake(req); }
export function renderSteady(req: SteadyRequest): Promise<SteadyResult> { return steadyNative("renderSteady").renderSteady(req); }
export function cancelSteady(jobId: string): void { steadyNative("cancelSteady").cancelSteady(jobId); }
export function addSteadyListener(cb: (e: SteadyEvent) => void): EventSubscription { return native().addListener("onSteadyEvent", cb); }
/**
 * Whether the linked native module is the build of 2026-10-11 or newer: it blurs a cut-out clip's ORIGINAL behind it (the request's
 * `backdrop`) and leaves a cut inside a clip unblended in Smooth slow motion (`cutDifference`). An older build ignores both keys.
 */
export function isBlurAndCutsBuild(): boolean { return typeof optional()?.blurAndCuts === "function"; }
/** True for the rejection of a measuring or a steady render that was cancelled (`cancelSteady`). */
export function isSteadyCancelled(e: unknown): boolean { return typeof e === "object" && e !== null && (e as { code?: unknown }).code === STEADY_CANCELLED; }

/** The module for a call that came with the build of 2026-10-12: missing = not linked (Expo Go); present but without the function = an older build. */
function peaksNative(fn: "soundPeaks" | "cancelSoundPeaks"): ClipyVideoNative {
  const m = native();
  if (typeof m[fn] !== "function") throw new Error(NOT_IN_BUILD);
  return m;
}
/**
 * Whether the linked native module can read a sound's waveform: false in Expo Go and in a build made before it. It is also how the
 * app knows the build of 2026-10-12 ("icons and light"), the first with the camera's usage text, SF Symbols, glass and notifications.
 */
export function isPeaksAvailable(): boolean { return typeof optional()?.soundPeaks === "function"; }
export function soundPeaks(req: SoundPeaksRequest): Promise<SoundPeaksResult> { return peaksNative("soundPeaks").soundPeaks(req); }
export function cancelSoundPeaks(jobId: string): void { peaksNative("cancelSoundPeaks").cancelSoundPeaks(jobId); }
/** True for the rejection of a waveform that was cancelled (`cancelSoundPeaks`). */
export function isPeaksCancelled(e: unknown): boolean { return typeof e === "object" && e !== null && (e as { code?: unknown }).code === PEAKS_CANCELLED; }
