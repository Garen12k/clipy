import { cutToBeats, placeBeats } from "@/src/editor/model/beats";
import { addAudioTrack, addTextOverlay, applyTextTemplate, setFilterForAllClips, setPhotoMotion, setTransition, trimClip, updateAudioTrackById } from "@/src/editor/model/ops";
import { clipDuration, sourceAfter, totalDuration } from "@/src/editor/model/timeline";
import { isPhoto, makeOverlay, type AudioTrack, type FilterId, type PhotoMotionId, type Project, type TransitionType } from "@/src/editor/model/types";
import type { TextTemplateId } from "@/src/editor/textTemplates";
import type { IoniconName } from "@/src/editor/toolGroups";

// "Quick edit": a finished draft from a style and the owner's photos and videos. A style is a RECIPE — data only, every id from the
// editor's own registries — and `buildQuickEdit` turns one into an ordinary project with the editor's own ops. Not to be confused
// with the editor's Templates tool (src/editor/templates.ts: a look for clips that exist).

export const QUICK_RECIPE_IDS = ["travel", "party", "calm", "cinematic", "retro", "vlog"] as const;
export type QuickRecipeId = (typeof QUICK_RECIPE_IDS)[number];

export interface QuickRecipe {
  id: QuickRecipeId; label: string; icon: IoniconName;
  /** A bundled track's manifest id (assets/music/manifest.json). */
  trackId: string;
  /** Which beats become markers: every beat, every 2nd, every 4th. */
  every: 1 | 2 | 4;
  /** How many marker steps a photo lasts, and the most a video may last. */
  hold: number; videoHold: number;
  transition: { type: TransitionType; duration: number };
  filter: FilterId; filterIntensity: number;
  title: string; textTemplate: TextTemplateId; titleY: number; titleScale: number;
  /** Photo motions, taken in turn photo by photo; empty = photos stay still. */
  motions: readonly PhotoMotionId[]; motionStrength: number;
}

export const QUICK_RECIPES: Record<QuickRecipeId, QuickRecipe> = {
  travel: { id: "travel", label: "Travel", icon: "airplane-outline", trackId: "field-of-dreams", every: 2, hold: 3, videoHold: 5,
    transition: { type: "slide", duration: 0.4 }, filter: "golden", filterIntensity: 0.7,
    title: "Our trip", textTemplate: "cleanTitle", titleY: 0.2, titleScale: 0.08, motions: ["zoomIn", "panLeft", "zoomOut", "panRight"], motionStrength: 0.5 },
  party: { id: "party", label: "Party", icon: "balloon-outline", trackId: "party-sector", every: 1, hold: 2, videoHold: 4,
    transition: { type: "flashWhite", duration: 0.3 }, filter: "vivid", filterIntensity: 0.8,
    title: "Party time", textTemplate: "boldPop", titleY: 0.5, titleScale: 0.1, motions: ["zoomIn", "zoomOut"], motionStrength: 0.8 },
  calm: { id: "calm", label: "Calm", icon: "leaf-outline", trackId: "bossa-nova", every: 2, hold: 2, videoHold: 4,
    transition: { type: "dissolve", duration: 0.8 }, filter: "pastel", filterIntensity: 0.7,
    title: "Quiet moments", textTemplate: "elegant", titleY: 0.5, titleScale: 0.07, motions: ["zoomIn", "zoomOut"], motionStrength: 0.3 },
  cinematic: { id: "cinematic", label: "Cinematic", icon: "film-outline", trackId: "jrpg2-piano", every: 2, hold: 3, videoHold: 5,
    transition: { type: "fade", duration: 0.8 }, filter: "tealOrange", filterIntensity: 0.8,
    title: "A short film", textTemplate: "cinema", titleY: 0.5, titleScale: 0.07, motions: ["zoomIn"], motionStrength: 0.4 },
  retro: { id: "retro", label: "Retro", icon: "radio-outline", trackId: "funked-up", every: 2, hold: 2, videoHold: 3,
    transition: { type: "wipe", duration: 0.4 }, filter: "vintage", filterIntensity: 0.9,
    title: "Good old days", textTemplate: "retro", titleY: 0.2, titleScale: 0.06, motions: ["panLeft", "panRight"], motionStrength: 0.5 },
  vlog: { id: "vlog", label: "Vlog", icon: "videocam-outline", trackId: "happy-adventure", every: 2, hold: 3, videoHold: 6,
    transition: { type: "none", duration: 0 }, filter: "crisp", filterIntensity: 0.6,
    title: "My day", textTemplate: "headline", titleY: 0.15, titleScale: 0.07, motions: ["zoomIn", "zoomOut"], motionStrength: 0.4 },
};

/**
 * `slack`: a clip is first given its target length plus this, then Cut to beats pulls it back onto the beat (so a rounding hair never
 * loses it a whole step). `fadeOut`: the music's fade at the video's end. `titleSeconds`: how long the title shows. `maxItems`: the
 * most photos and videos the picker lets through.
 */
export const QUICK = { slack: 0.05, fadeOut: 1, titleSeconds: 3, maxItems: 30 } as const;

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Seconds between two markers: `every` beats of the track (0 when the track has too few beats to tell). */
export function markerStep(beats: readonly number[], every: number): number {
  return beats.length > every ? beats[every] - beats[0] : 0;
}

/**
 * The draft. `project` holds the picked clips in the order they were picked and nothing else; `music` is the recipe's track as it
 * was copied into the project (`storage.importAudio`); `beats` are that track's beats in file seconds ([] = none known: the draft
 * then keeps the clips' own lengths and has no markers). In order:
 * 1. every photo gets `hold` marker steps, every longer video is cut to `videoHold` steps (each plus `QUICK.slack`);
 * 2. the music is laid under the video from its FIRST BEAT, so the video starts on a beat;
 * 3. markers are placed from its beats (`placeBeats`) and every clip, the last one too, is cut to them (`cutToBeats`);
 * 4. the music is trimmed to the video's end with a fade-out; markers past the end are dropped;
 * 5. the transition on every cut, the filter on every clip, a Motion on every photo in turn, the title over the first seconds.
 * A project without clips is returned as it is.
 */
export function buildQuickEdit(a: { recipe: QuickRecipe; project: Project; music: AudioTrack; beats: readonly number[]; titleId: string }): Project {
  const { recipe, project, music, beats, titleId } = a;
  if (project.clips.length === 0) return project;
  let p = project;
  const step = markerStep(beats, recipe.every);
  if (step > 0) for (const c of project.clips) {
    if (isPhoto(c)) p = trimClip(p, c.id, 0, r3(recipe.hold * step + QUICK.slack));
    else {
      const most = recipe.videoHold * step + QUICK.slack;
      if (clipDuration(c) > most) p = trimClip(p, c.id, c.trimStart, sourceAfter(c, c.trimStart, most));
    }
  }
  const first = beats.length > 0 ? Math.max(0, beats[0]) : 0;
  p = addAudioTrack(p, { ...music, start: 0, trimStart: first, trimEnd: music.sourceDuration, fadeIn: 0, fadeOut: 0 });
  p = cutToBeats(placeBeats(p, music.id, beats, recipe.every), true);
  const total = totalDuration(p);
  p = updateAudioTrackById(p, music.id, { trimEnd: Math.min(music.sourceDuration, first + total), fadeOut: QUICK.fadeOut });
  if (p.beatMarkers.some((m) => m > total + 1e-9)) p = { ...p, beatMarkers: p.beatMarkers.filter((m) => m <= total + 1e-9) };
  if (recipe.transition.type !== "none") for (const c of p.clips.slice(0, -1)) p = setTransition(p, c.id, recipe.transition);
  p = setFilterForAllClips(p, recipe.filter, recipe.filterIntensity);
  if (recipe.motions.length > 0) {
    let n = 0;
    for (const c of p.clips) if (isPhoto(c)) p = setPhotoMotion(p, c.id, { id: recipe.motions[n++ % recipe.motions.length], strength: recipe.motionStrength });
  }
  const end = Math.min(QUICK.titleSeconds, total);
  if (end > 0) {
    p = addTextOverlay(p, makeOverlay({ id: titleId, text: recipe.title, x: 0.5, y: recipe.titleY, fontScale: recipe.titleScale, start: 0, end }));
    p = applyTextTemplate(p, titleId, recipe.textTemplate);
  }
  return p;
}
