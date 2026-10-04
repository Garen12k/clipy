# Clipy vs CapCut — feature roadmap

**Date:** 2026-10-03
**Sources:** `capcut-visual-tools.md` (≈85 tools) and `capcut-audio-text-export-tools.md` (72 tools) in this folder. Both were compiled from CapCut's public pages, the App Store listing and tutorials; the app itself was not opened, so parameter ranges and preset names marked UNVERIFIED there are approximate. This file decides *what to build and in which order*; each group still gets its own design spec.

## How to read the table

- **Have** — already in Clipy.
- **Preview** — whether you can see it in Expo Go: **Yes** (exact), **Approx** (shown roughly with the "Preview" tag, real result only in the exported video), **No** (only exists in the real build).
- **Effort** — S (a day-sized task), M (a few tasks), L (a phase of its own), XL (needs technology Clipy does not have — machine-learning models or a server).
- Everything that changes the picture or sound must also be written into the Swift export engine, which has **never been compiled** (needs the Apple Developer account).

## A — Clip basics

| CapCut tool | Clipy | Preview | Effort | Notes |
|---|---|---|---|---|
| Split, trim, delete, duplicate, reorder | Have | Yes | — | |
| Add more clips to a project ("+") | Have | Yes | S | |
| Photos as clips (duration by dragging) | Have | Yes | M | |
| Transform by gesture (zoom / move / rotate) | Have | Yes | M | |
| Rotate 90°, mirror / flip | Have | Yes | S | |
| Crop with presets | Have | Yes | M | |
| Canvas background: colour / blur | Have | Approx (blur) | M | |
| Freeze frame | Have | Yes | S | becomes a photo clip |
| Reverse | Have | Approx | M | export only |
| Replace a clip (keep its edits) | Have | Yes | S | |
| Extract audio from a clip | Missing | Approx | M | see D |
| Auto reframe (follow the subject) | Missing | No | XL | needs ML |

## B — Look

| CapCut tool | Clipy | Preview | Effort | Notes |
|---|---|---|---|---|
| Filters with intensity slider | Have | Approx | S | add intensity + ~12 more filters |
| Adjust: brightness, contrast, saturation, exposure, temperature, tint, highlights, shadows, sharpen, vignette, fade, grain | Have | Approx | M | Core Image in export; tint layers in preview |
| Video effects (glitch, shake, blur, zoom, retro, light leaks…) | Have | Approx / No | L | ~12 hand-built effects, each a Core Image recipe |
| More transitions (slide directions, wipe, spin, blur…) | Have | Approx | M | |
| HSL / curves / colour wheels, LUT import | Missing | No | L | advanced; low priority |
| Body effects, retouch / beauty, relight | Missing | No | XL | needs ML |

## C — Motion

| CapCut tool | Clipy | Preview | Effort | Notes |
|---|---|---|---|---|
| Speed: constant | Have | Yes | — | CapCut range 0.1–100×; Clipy 0.25–4× |
| Speed curves (Montage, Bullet, Hero, Jump cut, Flash in / out, custom points) | Have (6 presets) | Approx | L | preview steps through rates |
| Clip animations In / Out / Combo | Have | Yes | M | ~10 each |
| Text and sticker animations In / Out / Loop | Have | Yes | M | ~10 each |
| Keyframes (position, scale, rotation, opacity; ease in / out) | Have | Yes | L | builds on A's transform |
| Smooth slow-motion (optical flow) | Missing | No | XL | frame interpolation |
| Stabilize | Missing | No | L | AVFoundation has support; export only |
| Motion tracking (text / sticker follows an object) | Missing | No | XL | Vision framework; later |

## D — Audio

| CapCut tool | Clipy | Preview | Effort | Notes |
|---|---|---|---|---|
| One music track, volume, clip volume / mute | Have | Yes | — | |
| Several audio tracks | Have | Yes | M | |
| Fade in / fade out | Have | Yes | S | |
| Voice-over recording | Have | Yes | M | expo-audio recording works in Expo Go |
| Sound-effects library | Have | Yes | M | 10 synthesized |
| Extract audio from a video | Missing | Approx | M | export only |
| Audio speed / pitch | Missing | Yes | S | |
| Beat markers (manual; auto later) | Have | Yes | M | auto-detect is L |
| Noise reduction, enhance voice, isolate voice | Missing | No | XL | ML |
| Voice effects / voice changer | Missing | No | L | audio units; export only |
| Text-to-speech | Missing | Yes | M | on-device iOS voices |
| Auto ducking (music dips under speech) | Have | Approx | M | |

## E — Layers

| CapCut tool | Clipy | Preview | Effort | Notes |
|---|---|---|---|---|
| Overlay / picture-in-picture (video or photo on top) | Have | Yes | L | second video player in preview |
| Opacity | Have | Yes | S | |
| Blend modes | Have | No | M | export only |
| Masks (circle, rectangle, linear, star, heart, mirror; feather, invert) | Have | Approx | L | 3 shapes; no feather |
| Chroma key (green screen) | Have | No | L | Core Image; export only |
| Remove background / auto cutout | Missing | No | XL | Vision person segmentation; iOS 15+; export only |
| Mosaic / blur a region | Have | Approx | M | blur box / mosaic box effects |

## F — Text and captions upgrades (not in the original A–E; suggested after C)

| CapCut tool | Clipy | Preview | Effort | Notes |
|---|---|---|---|---|
| Text, fonts, colour, outline, background | Have (16 fonts) | Yes | — | |
| More fonts, shadow, glow, spacing, opacity | Have | Yes | — | curved text still missing |
| Text templates and bubbles | Have (12) | Yes | — | |
| Auto captions | Have (native build only) | — | — | |
| Caption styles incl. word-by-word highlight (karaoke) | Have (native build) | Yes | — | six presets; very popular in short-form |
| Bilingual / translated captions | Missing | — | XL | needs a translation service |
| Stickers: emoji + shapes | Have | Yes | — | |
| Sticker library / GIFs / custom stickers from photos | Missing | Yes | M–L | needs bundled or licensed art |

## G — Project and export polish (suggested last)

| CapCut tool | Clipy | Preview | Effort | Notes |
|---|---|---|---|---|
| Export 720p / 1080p / 4K | Have | — | — | |
| Frame-rate and quality choice | Have | — | — | 24 / 30 / 60 fps; High / Smaller file (unverified until the first build) |
| Cover / thumbnail editor | Have | Yes | — | frame + title, Save to Photos, drafts list; Instagram thumbnail only |
| Timeline snapping, multi-select | Have | Yes | — | multi-select: main clips |
| Drafts list | Have | Yes | — | |
| Templates (replace clips in a ready-made edit) | Have 8 "looks" | Yes | L | CapCut's are full edits |
| Cloud sync of projects | Missing | — | L | Supabase storage; later |

## Out of scope (AI generation and paid-service features)

AutoCut, long-video-to-shorts, script-to-video, AI effects / expand / remove, voice cloning, video translator and dubbing, AI script writer. These depend on large server-side models and per-use fees; they are not planned.

## Recommended order

1. **A — Clip basics** (the tools people reach for right after split and trim).
2. **B — Look** (Adjust sliders and filter intensity are small and high-value; effects are the large part).
3. **C — Motion** (animations first, then keyframes, then speed curves).
4. **F — Text and caption upgrades** (word-highlight captions and text animations are among CapCut's most-used features).
5. **D — Audio.**
6. **E — Layers.**
7. **G — Polish.**

The user's stated order is A → E; F and G are additions proposed here. Before or between these, the first native build (Apple Developer account) is strongly advised: A–E add a great deal of export code that cannot be tested until then.
