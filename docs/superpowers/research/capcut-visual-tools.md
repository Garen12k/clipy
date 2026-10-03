# CapCut MOBILE - video / visual editing tools inventory

Research date: 2026-10-03. Scope: video/visual side of the mobile (iOS/Android) timeline editor.

## Method and reliability (read first)

- Web search + page fetch only. Fetches were summarised by a small model, so exact UI strings are only as good as the source page. I could NOT open the app. The App Store listing returned HTTP 429 once, and the Play Store page was truncated, so no store "What's New" text was verified beyond the version table in the Turkish App Store listing.
- CapCut's own pages (capcut.com/resource, /tools) are SEO articles, often written about Desktop, and rarely say "Pro". Third-party guides (capcutguide.com, tutsplus, miracamp, videowizardtools) back them up. Several of those are thin and contradict each other; contradictions are flagged.
- Pro labels in CapCut are per-asset (a badge on the effect/filter/template), not per-tool. Pro-tagged assets can be previewed free but export with a watermark unless you subscribe (bigvu). So "free" below means "the tool is free; some assets inside may be Pro".
- Marks: **UNVERIFIED** = not confirmed by any fetched page. **CONFLICT** = sources disagree. Anything unmarked is stated by at least one fetched page.
- Plans as of 2026 (secondary source): Free (1080p, basic tools), Standard ~$9.99/mo (mobile-oriented, removes watermark on Pro-tagged assets, no 4K/full AI), Pro ~$19.99/mo or $179.99/yr (4K, full AI toolkit). https://bigvu.tv/blog/capcut-free-vs-pro-what-2026s-restructure-actually-gives-you/ . Another page gives different price ranges; prices vary by region/store. Exact current prices UNVERIFIED.

## Key source URLs

- Official overview: https://www.capcut.com/resource/capcut-app
- Official speed tool page: https://www.capcut.com/tools/speed-ramp
- Official stabilizer page: https://www.capcut.com/resource/capcut-stabilizer
- Official AI enhance page: https://www.capcut.com/resource/ai-enhance-video
- Official AutoCut mobile page: https://www.capcut.com/resource/capcut-autocut
- App Store (Turkey storefront, English text): https://apps.apple.com/TR/app/id1500855883
- Tutsplus mobile series: stabilize https://photography.tutsplus.com/tutorials/how-to-quickly-stabilize-videos-in-capcut--cms-108875 ; filters https://photography.tutsplus.com/tutorials/how-to-quickly-add-filters-to-videos-in-capcut--cms-108764 ; backgrounds https://photography.tutsplus.com/tutorials/how-to-create-custom-backgrounds-in-capcut--cms-108866 ; face retouch https://photography.tutsplus.com/tutorials/how-to-retouch-faces-in-capcut-the-complete-guide--cms-108852 ; body https://photography.tutsplus.com/tutorials/a-complete-guide-to-body-effects-in-capcut--cms-108858
- capcutguide.com: masking https://capcutguide.com/capcut-masking-tutorial/ ; velocity/speed https://capcutguide.com/capcut-velocity-edit/ ; green screen https://capcutguide.com/capcut-green-screen-tutorial/ ; keyframes https://capcutguide.com/how-to-use-keyframes-in-capcut/ ; effects https://capcutguide.com/capcut-effects/ ; transitions https://capcutguide.com/capcut-transitions/

---

## 1. Clip basics

Tap a clip on the timeline and a bottom toolbar appears; it scrolls horizontally. A search-snippet listing of the mobile "Edit" options (27 described as free) names: Split, Speed, Animations, Effects, Delete, Enhance Voice, Isolate Voice, Retouch, Remove BG, Camera Tracking, Volume, Transform, AI Expand, Adjust, Video Quality, Filters, Overlay, Basic, Mask, Duplicate, Replace, Extract Audio, Opacity, Reverse, Freeze, Audio Effects, Beats, Link; and a Pro set: Auto Frame, Relight, Motion Blur, Stabilize, Reduce Noise. Source (search snippet only; the fetched page did not repeat it): https://photography.tutsplus.com/tutorials/how-to-quickly-stabilize-videos-in-capcut--cms-108875 . Treat the free/Pro split as CONFLICT (see Stabilize).

| Tool | UI name / path | What it does | Options | Free/Pro |
|---|---|---|---|---|
| Split | select clip, Split | Cuts the clip at the playhead | none | Free. App Store: "Trim and shorten clips and split or merge videos" https://apps.apple.com/TR/app/id1500855883 |
| Trim | drag clip handles | Shortens clip start/end | handle drag | Free (same App Store page) |
| Delete | select, Delete | Removes clip | - | Free (edit list above) |
| Duplicate | select, Duplicate | Copies clip | - | Free (edit list above) |
| Replace | select, Replace | Swap media, keep edits | - | Free (edit list above); behaviour details UNVERIFIED |
| Reorder | long-press and drag clip | Rearranges clips on a track | - | Free; exact gesture UNVERIFIED |
| Freeze | select, Freeze | Inserts a still frame at the playhead | freeze length trimmable (UNVERIFIED) | Free. App Store: "Freeze feature" |
| Reverse | select, Reverse | Plays clip backwards | - | Free (edit list above) |
| Mirror / Rotate / Crop | clip, Edit, Mirror / Rotate / Crop | Flip, rotate, crop | see crop row | Free. https://www.capcut.com/resource/how-to-use-capcut (Desktop-oriented: Crop, Freeze, Reverse, Rotate, Flip) |
| Crop presets | clip, Crop | Free-form crop or fixed ratio | Mobile: 16:9, 9:16, 1:1, 3:4 reported; Desktop adds 4:3, 2:1 and "Free". https://www.miracamp.com/learn/capcut/how-to-crop-videos-on . Pinch on preview zooms/crops | Free. Exact mobile preset list partly UNVERIFIED |
| Transform by gesture | pinch/drag/two-finger rotate in preview; also Transform and Basic panels | Scale, move, rotate clip | - | Free |
| Extract audio | clip, Extract Audio | Pulls audio from video onto an audio track | - | Free |
| Volume | clip, Volume | Per-clip volume slider | - | Free |
| Mute clip audio | UI name UNVERIFIED | - | - | UNVERIFIED |
| Auto reframe ("Auto Frame") | clip, Edit, Auto reframe | Re-crops around the subject for a new ratio | Mobile path "Edit > Auto reframe" (search snippet). Official page covers Desktop only: https://www.capcut.com/tools/auto-reframe | Pro in the edit-list; the Desktop how-to-use page also lists it as Pro |
| Opacity | clip, Opacity | Clip opacity slider | slider | Free |
| Link / Beats | clip, Link / Beats | Link clip to audio; beat markers (section 13) | - | details UNVERIFIED |

## 2. Speed

Sources: https://www.capcut.com/tools/speed-ramp ; https://capcutguide.com/capcut-velocity-edit/ ; App Store text "Speed adjustment from 0.1x to 100x with speed curves".

| Tool | Path | Details | Free/Pro |
|---|---|---|---|
| Normal speed | clip, Speed, Normal | Single slider; range 0.1x to 100x (App Store) | Free (bigvu lists "speed ramping" in the free plan) |
| Curve speed | clip, Speed, Curve (also written Edit > Speed > Curve > Custom) | Preset curves or custom: drag points up/down, "Add Point" for more | Free |
| Curve presets | same | Named in sources: Montage, Bullet, Jump Cut, Hero (hero time), Flash in / Flash out. The source says these are examples, not a permanent list. Full current list UNVERIFIED | Free; individual presets may be Pro (UNVERIFIED) |
| Custom points | Curve, Custom | Vertical position = speed, horizontal spacing = transition length; point count limit UNVERIFIED | Free |
| Smooth slow-mo / optical flow | in Speed panel | "Optical flow for smooth slow-motion with speed curves" (App Store). Generates in-between frames | Free per App Store; Pro status UNVERIFIED |
| Pitch option | Speed panel | Keep-pitch toggle UNVERIFIED; the official speed page documents no pitch feature | UNVERIFIED |
| Auto Velocity | UNVERIFIED mobile path | Automatic velocity-edit styling, distinct from manual curve | UNVERIFIED |

## 3. Canvas / format

| Tool | Path | Details | Free/Pro |
|---|---|---|---|
| Aspect ratio ("Ratio" / "Canvas") | deselect all clips, bottom toolbar, Ratio (or Canvas) | 9:16, 16:9, 1:1, 4:5 named on mobile. Full list (e.g. 3:4, 21:9) UNVERIFIED. https://www.capcut.com/create/video-aspect-ratio-guide-9-16-1-1-16-9 ; https://www.alphr.com/capcut-how-to-change-aspect-ratio/ | Free |
| Background - Color | Canvas / Background | Preset swatches, custom colour wheel, eyedropper to match video | Free |
| Background - Image | Background | Library images (free and Pro) or your own upload | Free + Pro assets |
| Background - Blur | Background | Four blur strength levels (tutsplus). Another source names styles (Halo, Pixel, Vertical, Chrome, Motion, Oblique); possibly Desktop, UNVERIFIED for mobile | Free |
| Brand backgrounds | Background | Media-kit integration per tutsplus, UNVERIFIED elsewhere | UNVERIFIED |
| Pattern/Style | - | One source says "Pattern"; tutsplus lists Color/Image/Blur/Brand. CONFLICT | - |

Source: https://photography.tutsplus.com/tutorials/how-to-create-custom-backgrounds-in-capcut--cms-108866 . Access: pinch the clip smaller so the background shows; Background is the last item of the toolbar.

## 4. Animation

Menu: clip, Animations. Tabs In, Out, Combo (a Loop tab appears in some builds; UNVERIFIED). Sources: https://moviemaker.minitool.com/news/add-animation-to-a-video-in-capcut.html ; https://instagramstoryview.com/capcut-animation-effects-list/ (page timed out, search snippet only).
- Described as "hundreds", split into In, Out, Combo. Exact count UNVERIFIED.
- Combo names reported: Zoom, Slide, Spin, Bounce, Elastic, Flash, Rotate, Glitch, Blur, Swing, Mask, Wipe Combo. These look like family names rather than asset names; UNVERIFIED.
- Combo = one animation spanning entry and exit. A duration slider exists in the panel; range UNVERIFIED.
- Free with Pro-badged assets (general rule).

## 5. Keyframes

Mobile: select clip, tap the diamond/keyframe button in the toolbar; set a keyframe at the playhead, move the playhead, change a value. https://capcutguide.com/how-to-use-keyframes-in-capcut/ ; https://videowizardtools.com/keyframes-in-capcut/
- Properties (mobile): position, scale, rotation, opacity (capcutguide). A search summary adds colour adjustments, audio volume and mask. Filter/adjust-strength keyframes UNVERIFIED.
- Mask keyframes: Circle (position, scale), Rectangle (position, scale, corner roundness), Linear (position, rotation), Star/Heart (position, scale). https://videowizardtools.com/capcut-mask-keyframes-guide/
- Easing/graph: mobile has a graph icon (videowizardtools); easing named Linear, Ease in, Ease out, Ease in-out (capcutguide). Preset graph curves ("Flow 1/Flow 2", "Bounce") are reported for Desktop and NOT confirmed for mobile. CONFLICT: one source says mobile has no full bezier graph editor.
- Free/Pro: core keyframing free (bigvu). videowizardtools says mask keyframing and advanced curves need Pro; other sources do not. CONFLICT.

## 6. Overlay / picture-in-picture

| Tool | Path | Details | Free/Pro |
|---|---|---|---|
| Add overlay (PiP) | no clip selected, Overlay, Add overlay | Puts a clip on a track above the main track; each overlay is its own layer. https://anfx.co/blog/how-to-use-video-overlays-capcut/ | Free |
| Layer order | track position | Higher track covers lower; drag between tracks (gesture UNVERIFIED) | Free |
| Opacity | overlay clip, Opacity | Slider; 40-70% suggested for textures (anfx) | Free |
| Blend / Mix | overlay clip, scroll toolbar to Blend (some versions "Mix") | Modes named across sources: Normal, Screen, Overlay, Soft Light, Multiply, Color Burn, Color Dodge, Hue, Saturation, Color, Luminosity; grouped as Normal, Darken, Lighten, Contrast, Comparative, HSL. https://www.capcut.com/create/blend-modes-creative-video-photo-effects . Complete list UNVERIFIED | Free (general sources) |
| Mask | clip, Mask | Shapes reported: Circle, Rectangle, Linear, Star, Heart, Mirror, filmstrip-style. Controls: position, rotation, size, feather, round corners (rectangle), invert. https://capcutguide.com/capcut-masking-tutorial/ ; https://filmora.wondershare.com/video-editing/capcut-mask.html . Mirror/filmstrip availability varies by build | Free (keyframe caveat above) |
| Chroma key | clip, Edit, Remove BG, Chroma Key (older: Cutout, Chroma Key) | Colour picker; Intensity/Strength; Shadow. Desktop adds Spill Suppression and edge colour correction which mobile lacks (search summary). https://capcutguide.com/capcut-green-screen-tutorial/ ; https://www.capcut.com/help/chroma-key-feature | Free (bigvu) |
| Remove BG - Auto removal | clip, Edit, Remove BG, Auto removal | AI subject cutout | Free in several sources; Pro status UNVERIFIED |
| Remove BG - Custom removal | same | Smart brush, Smart eraser, Simple eraser. https://www.capcut.com/resource/how-to-remove-background-in-capcut | Free (Pro UNVERIFIED) |
| Switch main/overlay ("Splice") | UNVERIFIED | No mobile control named "Splice" confirmed | UNVERIFIED |

## 7. Adjust

Mobile: select clip, Adjust. Names from https://www.capcut.com/resource/capcut-color-grading (Desktop-oriented), tutsplus, search summaries. Mobile specifics mostly UNVERIFIED.
- Lightness: Exposure (shown as "Brightness/Exposure" on mobile), Contrast, Highlight, Shadow, Whites, Blacks.
- Color: Temp, Tint, Saturation; Vibrance on Desktop.
- Effects section: Sharpen on Desktop; Vignette, Grain, Fade, Hue are not confirmed for mobile by any fetched page. UNVERIFIED.
- Advanced: HSL, Curves, Color wheels (shadows/midtones/highlights), LUT. https://www.capcut.com/tools/hsl-color
- "Auto adjust": not confirmed. UNVERIFIED.
- Color match / correction with "Apply all": mentioned for mobile in the colour-grading page.
- LUT import on mobile: UNVERIFIED (Desktop only confirmed).
- Free generally; Pro-badged filter/LUT assets exist.

## 8. Filters

Menu: Filters. Featured tab default; categories reported: Pro, Life, Scenery, Movies, Portrait (tutsplus), plus Trending, Opening & Closing, Lens, Light, Retro, Star (search summaries). Intensity slider (scale UNVERIFIED). Count: "weekly updated trending filters" (App Store); number UNVERIFIED. Filter creates a segment on its own track you can trim. https://photography.tutsplus.com/tutorials/how-to-quickly-add-filters-to-videos-in-capcut--cms-108764 . Free with Pro-labelled filters.

## 9. Effects

Menu: Effects, then Video effects or Body effects. https://capcutguide.com/capcut-effects/ ; https://www.capcut.com/resource/video-effects-guidance
- Video effects: frame-wide treatments (light, blur, texture, distortion, camera-style motion); App Store lists "Glitch, Blur, 3D, etc." Category names beyond that UNVERIFIED.
- Body effects: need a detected person; motion trails, outlines, shadows, particles. Example names not confirmed.
- Parameters: most effects have a few sliders; names vary per effect. UNVERIFIED specifics.
- Behaviour: effect lives on its own effect track; you set start/end and it covers whatever is beneath in that time range. A per-clip vs all-clips choice is UNVERIFIED on mobile.
- Free with Pro badges; weekly additions.

## 10. Transitions

Menu: tap the small white square between two adjacent clips. https://capcutguide.com/capcut-transitions/
- Categories reported: Trending, Basic, Camera, Overlay, Glitch, Blur, Effect, Social Media, Combo; examples Fade, Slide, Wipe, Zoom, Push In, Spin, Swing, Flash. Which is the current set is UNVERIFIED. https://www.freevisuals.net/post/how-to-create-transitions-in-capcut-a-step-by-step-guide
- Duration slider: up to about 5 s reported; 0.5-1.5 s recommended. Limited by clip length.
- "Apply to all": checkbox at the bottom of the transition panel.
- Needs two adjacent clips on the same track with no gap.
- Free with Pro-badged transitions.

## 11. Stabilize, noise, enhance, relight, retouch, tracking

| Tool | Path | Details | Free/Pro |
|---|---|---|---|
| Stabilize | clip, Edit, Stabilize | Three levels: Minimal cropping / Recommended / Most stable (official page says "Minimum cut"). Works by cropping. https://www.capcut.com/resource/capcut-stabilizer | CONFLICT: official page says free; edit-list source puts it in Pro |
| Video quality / noise | Adjust, Video quality (sliders for flicker and noise); separate "Reduce Noise" in the Pro list | https://www.capcut.com/resource/ai-enhance-video | Official: free; edit list: Pro. CONFLICT |
| Enhance / upscale | AI upscale to HD/4K | Official page covers Web/desktop/mobile; mobile name UNVERIFIED | Official: free |
| Relight | clip, Edit, Relight | Balances uneven lighting | Pro (edit list) |
| Motion blur | clip, Edit, Motion blur | In Pro group | Pro (edit list) |
| Retouch - Face | clip, Edit, Retouch, Face | Tabs: Retouch (Smooth, Brighten, White teeth), Reshape (Face, Eyes, Nose, Mouth, Eyebrows; Slim, Chin length, Size), Makeup (lipstick, eyeshadow, eyelashes, Looks), Manual. https://photography.tutsplus.com/tutorials/how-to-retouch-faces-in-capcut-the-complete-guide--cms-108852 | Mostly free; Looks and some sliders Pro |
| Retouch - Body | Edit, Retouch, Body | Straight shoulders (Pro), Wide shoulders (Pro), Arms (Pro), Legs, Body, Waist, Head (free) | Mixed |
| Track (motion tracking) | clip, Track | Place box on object, Start Tracking, then add text/sticker/blur that follows. https://www.miracamp.com/learn/capcut/motion-tracking | Free per that guide |
| Camera tracking | clip, Camera Tracking | In the edit list; AI toolkit per bigvu | Pro (bigvu) |
| Stickers following objects | sticker, Track | Via Track; separate sticker-tracking UI UNVERIFIED | Free |

## 12. Templates and AI video tools (brief)

| Tool | Path | Notes | Free/Pro |
|---|---|---|---|
| Templates | home, Templates | Pick template, drop media; Pro-tagged assets watermark | Free + Pro assets |
| AutoCut | home, AutoCut | Pick clips, auto edit with music/template, then adjust. https://www.capcut.com/resource/capcut-autocut | Free; some assets Pro |
| Long video to shorts | All tools | Cuts long video into clips. https://www.capcut.com/resource/ai-video-cut | UNVERIFIED |
| Auto captions, text to speech, auto BG removal | Text / Audio | App Store features | Free basics; speaker-ID captions Pro (bigvu) |
| AI Expand | clip, Edit, AI Expand | In edit list; behaviour UNVERIFIED | Free per edit list |
| AI people remover / text remover, script-to-video | UNVERIFIED mobile paths | Appear in 2026 summaries | UNVERIFIED |
| Edit Pilot / Smart Split | - | Edit Pilot "testing began" Dec 2025 (socialbee); Smart Split from an SEO page only | UNVERIFIED |

## 13. Timeline behaviours

| Behaviour | Detail | Source |
|---|---|---|
| Main-track magnet | Magnet icon at right of timeline; fills gaps automatically | https://filmora.wondershare.com/answers/is-capcut-auto-align-images-timeline-markers.html |
| Snapping | Clips/handles snap to markers and edges | same |
| Pinch zoom | Pinch the timeline to zoom to waveform level | https://cursa.app/en/page/beat-based-editing-in-capcut-syncing-cuts-transitions-and-motion-to-music |
| Multi-select | UNVERIFIED on mobile | - |
| Undo/redo | UNVERIFIED in sources | - |
| Cover/thumbnail | UNVERIFIED in sources | - |
| Add (+) | UNVERIFIED in sources | - |
| Photo durations | UNVERIFIED (default length) | - |
| Compound clips | Described for Desktop only; mobile UNVERIFIED | filmora CapCut timeline article |
| Markers/beats | Auto beat markers (yellow) from audio; manual add; drag to adjust | cursa.app link above |

---

## (a) Top 15 for ordinary short-form creators

Evidence is indirect: how many dedicated guides each topic had in my searches (capcut.com/resource plus third-party), the App Store feature list, and bigvu's free-plan list. I did not measure actual usage.

1. Split / trim / delete (App Store first bullet)
2. Speed, normal + curve (dedicated official /tools/speed-ramp page)
3. Aspect ratio / canvas
4. Auto captions (outside my scope; top App Store item)
5. Filters with intensity
6. Transitions (white-square tap)
7. Video effects
8. Keyframes (position/scale/opacity)
9. Overlay + opacity (PiP, reactions)
10. Remove BG / chroma key
11. Mask
12. Animations (In/Out/Combo)
13. Adjust (brightness, contrast, saturation, temperature)
14. Templates / AutoCut
15. Stabilize / reverse / freeze (group)

## (b) 2025-2026 changes older tutorials miss

- 2025 plan restructure into Free / Standard / Pro; more AI items behind Pro (bigvu).
- Native iPad / Android-tablet app, Feb 2026 (https://socialbee.com/blog/tiktok-updates/); App Store "CapCut Pad" listing https://apps.apple.com/bm/app/capcut-pad/id6753943963
- "Edit Pilot" AI editing test and Nano Banana Pro photo editing, Dec 2025 (socialbee).
- Near-weekly App Store builds, 18.8.0 (Jul 28) to 19.6.0 (Sept 21); notes are generic "fixed issues; improved trimming", year not stated. https://apps.apple.com/TR/app/id1500855883
- CapCut Ultra subscription mentioned for June 2026 (search summary only; primary source UNVERIFIED).
- Keyframe graphs and spill suppression are Desktop features that many "CapCut" tutorials show; not confirmed on mobile.
- "Chroma Key 2.0" and "Smart Split" appear only in SEO summaries; no primary source found.

## Gaps

Not confirmed: full blend-mode list, full speed-curve preset list, animation counts, filter counts, exact mobile Adjust slider list (Fade, Vignette, Grain, Hue, Sharpen, Auto adjust), LUT import on mobile, pitch toggle, Splice / main-track switch, compound clips on mobile, cover editor, photo default duration, effect-track scope, mute-clip control, undo/redo and multi-select details. These need on-device inspection or CapCut's in-app help.
