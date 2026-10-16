import { cutToBeats, placeBeats } from "@/src/editor/model/beats";
import { addAudioTrack, addTextOverlay, applyTextTemplate, pasteTextLook, setFilterForAllClips, setPhotoMotion, setTransition, trimClip, updateAudioTrackById, type TextLook } from "@/src/editor/model/ops";
import { clipDuration, sourceAfter, totalDuration } from "@/src/editor/model/timeline";
import { isPhoto, makeOverlay, type Align, type AudioTrack, type FilterId, type PhotoMotionId, type Project, type TransitionType } from "@/src/editor/model/types";
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

export interface StyleTitle { text: string; look: TextLook; x: number; y: number; scale: number; rotation: number; align: Align }
/** A plan's title: a built-in recipe's (its words through a text template) or a user style's (its words with a whole look, place and turn). */
export type QuickTitle =
  | { from: "template"; text: string; templateId: TextTemplateId; y: number; fontScale: number }
  | ({ from: "look" } & StyleTitle);
/** What `buildQuickEdit` reads: a built-in recipe (`planOfRecipe`) or a user style (`planOfStyle`, userStyles.ts). */
export interface QuickPlan {
  every: 1 | 2 | 4; hold: number; videoHold: number;
  /** Seconds of one marker step (a user style's median gap, `paceFor`); left out = the first gap, `markerStep` (every built-in recipe). */
  step?: number;
  transition: { type: TransitionType; duration: number };
  filter: FilterId | null; filterIntensity: number;
  title: QuickTitle | null;
  motions: readonly PhotoMotionId[]; motionStrength: number;
}

/** A built-in recipe as the plan `buildQuickEdit` reads: field for field, so a recipe builds exactly what it built before plans existed (the PROOF). */
export function planOfRecipe(r: QuickRecipe): QuickPlan {
  return { every: r.every, hold: r.hold, videoHold: r.videoHold, transition: r.transition, filter: r.filter, filterIntensity: r.filterIntensity,
    title: { from: "template", text: r.title, templateId: r.textTemplate, y: r.titleY, fontScale: r.titleScale }, motions: r.motions, motionStrength: r.motionStrength };
}

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
 * 3. markers are placed from its beats (`placeBeats`) and every clip, the last one too, is cut to them (`cutToBeats`); a clip the
 *    cut did not change (it plays after the music's last beat) gives its slack back, so it has exactly its target length;
 * 4. the music is trimmed to the video's end with a fade-out; markers past the end are dropped;
 * 5. the transition on every cut, the filter on every clip, a Motion on every photo in turn, the title over the first seconds.
 * A project without clips is returned as it is.
 * `recipe` is a built-in recipe or a style's plan (`planOfStyle`); `music` null = no sound: nothing is cut and no marker is placed; a null filter or title is left out.
 */
export function buildQuickEdit(a: { recipe: QuickRecipe | QuickPlan; project: Project; music: AudioTrack | null; beats: readonly number[]; titleId: string }): Project {
  const { project, music, beats, titleId } = a;
  const plan = "textTemplate" in a.recipe ? planOfRecipe(a.recipe) : a.recipe;
  if (project.clips.length === 0) return project;
  let p = project;
  const step = music ? (plan.step ?? markerStep(beats, plan.every)) : 0;
  /** The clips that were given slack: id -> the source end of the target length WITHOUT it. */
  const exact = new Map<string, number>();
  if (step > 0) for (const c of project.clips) {
    if (isPhoto(c)) {
      p = trimClip(p, c.id, 0, r3(plan.hold * step + QUICK.slack));
      exact.set(c.id, r3(plan.hold * step));
    } else {
      const most = plan.videoHold * step;
      if (clipDuration(c) > most + QUICK.slack) {
        p = trimClip(p, c.id, c.trimStart, sourceAfter(c, c.trimStart, most + QUICK.slack));
        exact.set(c.id, sourceAfter(c, c.trimStart, most));
      }
    }
  }
  let total = totalDuration(p);
  if (music) {
    const first = beats.length > 0 ? Math.max(0, beats[0]) : 0;
    p = addAudioTrack(p, { ...music, start: 0, trimStart: first, trimEnd: music.sourceDuration, fadeIn: 0, fadeOut: 0 });
    const slacked = p.clips;
    p = cutToBeats(placeBeats(p, music.id, beats, plan.every), true);
    // The slack was only there for the cut: the clips after the last one a beat reached still carry it, so each goes back to its
    // exact target length. Only that trailing run — nothing that was cut onto a beat is touched, and no cut just made can move.
    const same = (i: number) => p.clips[i].trimStart === slacked[i].trimStart && p.clips[i].trimEnd === slacked[i].trimEnd;
    let tail = slacked.length;
    while (tail > 0 && same(tail - 1)) tail--;
    for (const before of slacked.slice(tail)) {
      const end = exact.get(before.id);
      if (end !== undefined) p = trimClip(p, before.id, before.trimStart, end);
    }
    total = totalDuration(p);
    p = updateAudioTrackById(p, music.id, { trimEnd: Math.min(music.sourceDuration, first + total), fadeOut: QUICK.fadeOut });
  }
  if (p.beatMarkers.some((m) => m > total + 1e-9)) p = { ...p, beatMarkers: p.beatMarkers.filter((m) => m <= total + 1e-9) };
  if (plan.transition.type !== "none") for (const c of p.clips.slice(0, -1)) p = setTransition(p, c.id, plan.transition);
  if (plan.filter !== null) p = setFilterForAllClips(p, plan.filter, plan.filterIntensity);
  if (plan.motions.length > 0) {
    let n = 0;
    for (const c of p.clips) if (isPhoto(c)) p = setPhotoMotion(p, c.id, { id: plan.motions[n++ % plan.motions.length], strength: plan.motionStrength });
  }
  const end = Math.min(QUICK.titleSeconds, total);
  const t = plan.title;
  if (end > 0 && t) {
    if (t.from === "template") {
      p = addTextOverlay(p, makeOverlay({ id: titleId, text: t.text, x: 0.5, y: t.y, fontScale: t.fontScale, start: 0, end }));
      p = applyTextTemplate(p, titleId, t.templateId);
    } else {
      p = addTextOverlay(p, makeOverlay({ id: titleId, text: t.text, x: t.x, y: t.y, scale: t.scale, rotation: t.rotation, align: t.align, start: 0, end }));
      p = pasteTextLook(p, titleId, t.look);
    }
  }
  return p;
}
