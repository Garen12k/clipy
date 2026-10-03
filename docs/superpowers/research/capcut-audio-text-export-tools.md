# CapCut Mobile: Audio, Text, Stickers, Captions, Export and Project Tools

Research date: 2026-10-03. Scope: CapCut mobile (iOS/Android) timeline editor.

## Read this first: confidence and method

- This was a desk-research pass. Most sources are CapCut's own marketing/resource pages (capcut.com/resource, /tools, /help) plus third-party tutorials and reviews. **I could not open the app, and I could not reach CapCut's help-center articles on individual audio or text panels.** CapCut's own pages mostly describe the web/desktop editors and are vague about mobile.
- Tags: **[CONFIRMED-SRC]** = a fetched page states it (URL given). **UNVERIFIED** = plausible and commonly reported, but no fetched source states it, or sources conflict. Numeric ranges (volume %, fade seconds, font counts) are almost all UNVERIFIED. Check them in the real app before copying them into a spec.
- Pricing/Pro status is the least reliable part. The tiers changed more than once and third-party sites disagree on dates and quotas. CapCut does not document per-feature gating publicly; the Pro badge in the app is the only ground truth.
- Platform labels: **M** = mobile, **D** = desktop, **W** = web. Where a source only describes D/W, I say so.

## 0. Plans and pricing snapshot (affects every "Free/Pro" label below)

| Item | Finding | Source |
|---|---|---|
| Tiers | Free, Standard (about $9.99/mo, monthly only), Pro (about $19.99/mo or $179.99/yr), Team, Enterprise. The old Pro became "Standard" and a new higher Pro was added. | https://socialrails.com/blog/capcut-pricing-guide |
| App Store IAP | Standard Monthly $9.99, Pro Monthly $19.99, a yearly sub $89.99 (US listing). | https://apps.apple.com/us/app/capcut-video-editor/id1500855883 |
| Pro extras | Full AI toolkit (about 1,200 credits), 1 TB cloud, 4K/HDR export listed as Pro in one review (UNVERIFIED: not in CapCut docs). | https://socialrails.com/blog/capcut-pricing-guide |
| AI is credit-metered on all plans | Pro does not mean unlimited generation. | https://arwriterai.com/en/blog/capcut-ai-features-complete-guide-2026/ |
| Date conflict | One source says the Pro price rose in May 2025; another frames it as a 2026 change. Exact date UNVERIFIED. | same two sources |
| Music licensing | "No rights are granted for the built-in sound recordings and musical works" under general terms. A separate Commercial Sounds library is cleared only within CapCut, TikTok and TikTok for Business. | https://socialrails.com/blog/capcut-pricing-guide ; https://artyfile.com/blog/capcut-music-commercial-use-guide ; https://www.foximusic.com/blog/commercial-music-licensing-tiktok-guide/ |

## 1. Audio sources

| # | Tool (UI name) | Menu path (M) | What it does | Options | Free/Pro | Source / confidence |
|---|---|---|---|---|---|---|
| 1 | Sounds (music library) | Audio → Sounds | Browse and add library music to a new audio track. | Categories/search, favourites. Category names UNVERIFIED. | Mostly free; some tracks region/licence-limited. | App Store says "millions of music clips and sound effects": https://apps.apple.com/us/app/capcut-video-editor/id1500855883 |
| 2 | Commercial Sounds | Sounds, commercial filter (name/location UNVERIFIED) | Tracks cleared for commercial content, but only inside TikTok/CapCut ecosystem. | n/a | Free (UNVERIFIED) | https://artyfile.com/blog/capcut-music-commercial-use-guide |
| 3 | Sound effects | Audio → Sound effects | Library of SFX added as separate tracks. | Category list UNVERIFIED. | Free, some Pro (UNVERIFIED) | App Store page above; https://www.capcut.com/resource/audio-editor-android |
| 4 | Extract audio | Select video clip → Extract audio (bottom toolbar) | Creates a separate audio track from the clip. Source: appears as a separate waveform track. | One-tap. Export audio-only as MP3/WAV is mentioned for the online editor only. | Free per CapCut's iPhone guide; a review lists it as newly paywalled. **Conflict.** | https://www.capcut.com/resource/extract-audio-from-video ; https://www.capcut.com/resource/extract-audio-from-video-iphone ; https://unstar.app/blog/capcut-everything-is-pro-now-cant-export-reviews-2026 |
| 5 | Voiceover / Record | Audio → Voiceover (UNVERIFIED label) | Record voice onto a track while video plays. | A teleprompter-style recorder is mentioned for the online editor. Mobile options UNVERIFIED. | Free | https://www.capcut.com/resource/audio-editor-android |
| 6 | Import from device | Audio → From device / Extracted (UNVERIFIED) | Add local audio files. | n/a | Free | UNVERIFIED |
| 7 | Copyright check | Export area (UNVERIFIED) | Checks music against TikTok-oriented rights; not reliable for YouTube/Instagram. | Pass/fail | Free | https://www.trademarkia.com/news/business/capcut-music-copyright-guide (via search snippet only) |
| 8 | TikTok sounds link | Sounds → TikTok/Favourites (UNVERIFIED) | Use sounds saved on a linked TikTok account. | n/a | Free | UNVERIFIED |

## 2. Audio editing per clip/track

| # | Tool | Path (M) | What it does / options | Free/Pro | Source / confidence |
|---|---|---|---|---|---|
| 9 | Volume | Select audio → Volume | Slider. Range 0 to 1000% is commonly cited, UNVERIFIED. Online editor uses dB. | Free | https://www.capcut.com/resource/audio-editor-android (dB for web) |
| 10 | Fade in / Fade out | Select audio → Fade | Two sliders (seconds). Max length UNVERIFIED. | Free | named in https://www.capcut.com/resource/audio-editor-android |
| 11 | Speed / Pitch | Select audio → Speed (change pitch toggle) | Speed slider, "Change pitch" toggle to keep or shift pitch. Range UNVERIFIED. | Free | UNVERIFIED for mobile specifics |
| 12 | Split / Trim / Delete / Duplicate (Copy) | Select audio → Split, Delete, Copy | Standard timeline ops. | Free | UNVERIFIED |
| 13 | Beats (Beat markers) | Select audio → Beats | Auto beat markers (with a slider from "light" to "intense") or manual add/clear. | Free | Light-to-intense wording: https://www.capcut.com/resource/extract-audio-from-video-iphone |
| 14 | Reduce noise | Select audio/video → Reduce noise | Toggle plus intensity slider. | Free (one review lists it as free on all plans) | https://www.capcut.com/resource/noise-reduction-guidance ; https://arwriterai.com/en/blog/capcut-ai-features-complete-guide-2026/ |
| 15 | Enhance voice | Select audio/video → Enhance voice | Clarity processing for speech. | Free (UNVERIFIED) | named in a search summary; UNVERIFIED |
| 16 | Isolate voice / Vocal isolation | Select clip → Isolate voice (UNVERIFIED path) | Separates vocals from background; can keep or remove either. | Free per CapCut iPhone guide; D version "more professional". | https://www.capcut.com/resource/extract-audio-from-video-iphone |
| 17 | Voice effects (changer) | Select clip → Voice effects | Groups: basic, funny, synth, retro, speech-to-song. Individual names on M UNVERIFIED. Desktop names: echo, Lo-Fi, electronic, trickster, chipmunk. Online: chipmunk, high, low, deep, robot, megaphone, distorted, elf, synth. | Mostly free per CapCut; some Pro (UNVERIFIED). | https://www.capcut.com/resource/best-voice-changer |
| 18 | Voice characters / Voice filters | within Voice effects | Two sub-tabs on D (filters vs characters); M likely same. | Mixed | https://www.capcut.com/resource/best-voice-changer |
| 19 | Normalize loudness (Loudness normalization) | Select audio → Normalize loudness (UNVERIFIED label) | Evens volume to a target level. Target -23 LUFS is stated on CapCut's web tool page; mobile target UNVERIFIED. | Free | https://www.capcut.com/tools/loudness-normalization |
| 20 | Audio keyframes | Select audio → keyframe diamond | Animate volume over time. | Free (UNVERIFIED) | App Store lists "keyframe animation across all settings". |
| 21 | Auto ducking | Select music track → Auto ducking (UNVERIFIED) | Lowers music under speech; sensitivity setting. A CapCut "ideas" page discusses speech-detection ducking, but it is about an AI workflow, not clearly the mobile toggle. | UNVERIFIED | https://www.capcut.com/ideas/seedance-2-0-for-audio-ducking |
| 22 | Multiple audio tracks | Timeline | Multiple audio layers (music, SFX, voice). Exact limit UNVERIFIED. | Free | https://www.capcut.com/resource/audio-editor-android |

## 3. Text

| # | Tool | Path (M) | What it does / options | Free/Pro | Source / confidence |
|---|---|---|---|---|---|
| 23 | Add text | Text → Add text | Adds a text layer. | Free | https://www.miracamp.com/learn/capcut/how-to-add-text |
| 24 | Fonts | Text → Font (tab in editor) | Library of fonts by category; **importing local fonts is supported** per App Store ("locally importable fonts"). Counts UNVERIFIED. | Many free, some Pro | https://apps.apple.com/us/app/capcut-video-editor/id1500855883 |
| 25 | Style: colour, stroke, shadow, background | Text → Style | Colour, stroke (outline), shadow, background box, size, opacity. | Free | https://www.miracamp.com/learn/capcut/how-to-add-text |
| 26 | Style: glow | Style | Glow with intensity, range and position, per one tutorial. | Free (UNVERIFIED) | search snippet on capcut.com glow/tutorial results |
| 27 | Style: spacing, alignment, curve/arc, blend | Style/Format | Letter and line spacing, alignment; curve and blend UNVERIFIED on M. | Free | UNVERIFIED |
| 28 | Text templates | Text → Text template | Pre-animated text designs with placeholder lines. | Many free, some Pro | App Store: "custom text templates" |
| 29 | Effects (text effects tab) | Text editor → Effects | Preset styled effects (glitter etc.). Names UNVERIFIED. | Mixed | UNVERIFIED |
| 30 | Bubbles | Text editor → Bubble | Speech/label bubble backgrounds. | Mixed | search snippet, YouTube lesson: https://www.youtube.com/watch?v=e5DIn4X0Yhg (not opened) |
| 31 | Text animation: In / Out / Loop | Select text → Animation | Three preset groups plus a duration slider. Example names (fade, zoom, typewriter, slide, glitch, wave, bounce, shake) come from tutorials, not official lists. Durations/min/max UNVERIFIED. | Mixed | https://capcutguide.com/capcut-text-animation/ ; https://www.capeditcut.com/smooth-text-animations/ |
| 32 | Text keyframes | Select text → keyframe | Position, scale, opacity (rotation too). | Free | https://capcutguide.com/capcut-text-animation/ |
| 33 | Text-to-speech | Text → Text to speech (select text layer first) | Converts text layer into a voice track. 50+ voices cited; 200+ cited elsewhere (conflict). Languages include English, Spanish, Chinese, Malay, Vietnamese, Thai, Japanese; list varies by region. | Standard voices free, premium voices paid | https://arwriterai.com/en/blog/capcut-ai-features-complete-guide-2026/ ; https://www.capcut.com/tools/text-to-speech |
| 34 | Text tracking | Select text → Tracking | Attaches text to a moving object. | Free (limited duration on free per one source for body tracking) | https://www.miracamp.com/learn/capcut/motion-tracking |
| 35 | Batch edit | Text → Batch edit (UNVERIFIED) | Edit several text/caption items in a list. | UNVERIFIED | no source |
| 36 | Apply to all (style) | In caption style panel | Applies one style to every caption. | Free | https://crepal.ai/blog/aivideo/blog-ai-text-captions-capcut-guide/ |
| 37 | Karaoke / word highlight | Caption styles or Auto lyrics | Word-by-word highlighting styles exist as templates. Name on M UNVERIFIED. | Mixed | UNVERIFIED |

## 4. Captions

| # | Tool | Path (M) | What it does / options | Free/Pro | Source / confidence |
|---|---|---|---|---|---|
| 38 | Auto captions | Text → Auto captions | Speech recognition to caption layers. 20+ languages; audio source choice (Original sound / Voiceover / Both), per one tutorial. | **Quota-limited on Free.** One third-party test (May 2026) says 5 generations per rolling 30 days, undocumented by CapCut. | https://www.capcut.com/help/how-to-recognise-subtitles ; https://crepal.ai/blog/aivideo/blog-ai-text-captions-capcut-guide/ ; https://reelvideocaptions.com/blog/capcut-auto-captions-not-free-anymore.html |
| 39 | Bilingual/translated captions | After generation (UNVERIFIED on M) | Translate caption text. | Likely Pro / credits | UNVERIFIED |
| 40 | Caption styles/templates | Caption edit → Style, Animation | Fonts, colour, outline/shadow, animations (Pop, Fade, Slide, Bounce). Web has "Style captions with AI". | Mixed | https://crepal.ai/blog/aivideo/blog-ai-text-captions-capcut-guide/ |
| 41 | Filler-word removal | UNVERIFIED on M | Seen on D/W as remove filler words. | UNVERIFIED | no source |
| 42 | Auto lyrics | Text → Auto lyrics | Recognises sung lyrics into text. | UNVERIFIED | no source fetched |
| 43 | SRT export | **Desktop/Web only** per CapCut help; "advanced features like .srt export are primarily on Desktop and Web". | Not on M (as of source, Jan 2026). | n/a | https://www.capcut.com/help/how-to-recognise-subtitles |
| 44 | Edit captions (bulk) | Tap caption → Edit / list | Edit individual boxes; bulk list UNVERIFIED on M. | Free | https://www.capcut.com/help/how-to-recognise-subtitles |

## 5. Stickers and overlays

| # | Tool | Path (M) | What it does / options | Free/Pro | Source / confidence |
|---|---|---|---|---|---|
| 45 | Stickers | Sticker (bottom bar) → library/search | Library by theme and style; GIFs, emoji, icons. Resize, rotate, animate. | Mostly free, some Pro | https://www.capcut.com/tools/custom-stickers-online ; https://photography.tutsplus.com/tutorials/how-to-add-stickers-to-videos-in-capcut--cms-108820 |
| 46 | Sticker animation | Select sticker → Animation | In/Out/Loop style (Fade, Slide, Zoom named). | Mixed | https://www.capcut.com/tools/custom-stickers-online |
| 47 | Custom sticker from photo | Import photo, Remove BG (Auto removal / Custom removal), use as overlay | Cut-out becomes a sticker-like overlay. | Auto removal quota-limited on Free | search summaries, https://arwriterai.com/en/blog/capcut-ai-features-complete-guide-2026/ |
| 48 | AI sticker generator | Sticker → AI (UNVERIFIED on M) | Text-to-sticker. | Credits | https://www.capcut.com/tools/ai-sticker-generator (web page, not opened) |
| 49 | Sticker tracking | Select sticker → Tracking | Follows a moving subject. | Free | https://www.miracamp.com/learn/capcut/motion-tracking |
| 50 | Add overlay | Overlay → Add overlay | Second image/video layered with mask, blend, opacity. | Free | https://capcutguide.com/capcut-masking-tutorial/ (via search) |

## 6. Drawing, shapes, mosaic and blur

| # | Tool | Path (M) | What it does / options | Free/Pro | Source / confidence |
|---|---|---|---|---|---|
| 51 | Mask | Select clip → Mask | Six basic shapes plus Draw (pen), invert, feather, keyframes. | Free | https://capcutguide.com/blur-part-of-video-capcut/ (via search) |
| 52 | Blur / Mosaic / Pixelate effects | Effects → Blur / Mosaic | Applied as video effects, restrict with Mask on overlay. | Mixed | https://www.capcut.com/resource/how-to-blur-face-on-capcut |
| 53 | Face blur | Effects (UNVERIFIED label) | Auto face blur. | UNVERIFIED | search snippet |
| 54 | Freehand drawing on video | UNVERIFIED. I found no source for a freehand "Draw" annotation layer on mobile. | n/a | n/a | not found |

## 7. Cover, project settings, export

| # | Tool | Path (M) | What it does / options | Free/Pro | Source / confidence |
|---|---|---|---|---|---|
| 55 | Edit cover | Timeline start → Cover | Choose frame or import image, add text. | Free | UNVERIFIED (no source) |
| 56 | Ratio | Ratio (bottom bar) | 9:16, 1:1, 16:9 etc. | Free | https://www.accio.com/blog/how-to-change-video-dimensions-for-tiktok-on-capcut-a-comprehensive-guide |
| 57 | Export resolution | Export → resolution | 480p to 4K cited in tutorials; 1080p and 4K definitely cited. Free users on 4K/HDR: UNVERIFIED. | 1080p/4K gating UNVERIFIED | https://www.miracamp.com/learn/capcut/how-to-export-high-quality-videos |
| 58 | Frame rate | Export → Frame rate | 24, 30, 60 fps. | Free (UNVERIFIED) | https://www.mygamingdiaries.com/2026/01/best-capcut-export-settings-for-tiktok.html (via search) |
| 59 | Quality / bitrate | Export → Bitrate (Recommended/Higher/Lower) | CapCut labels (Recommended, Higher, Lower) are UNVERIFIED in sources. Tutorials give 8-12 Mbps targets. | Free | UNVERIFIED |
| 60 | Codec | Export → Codec | H.264 or HEVC choice cited in a tutorial. | Free | https://www.miracamp.com/learn/capcut/how-to-export-high-quality-videos |
| 61 | HDR | Export → HDR | App Store: "4K 60fps exports with smart HDR". One review: mobile limited to SDR beyond some points (conflict). | Likely Pro | App Store; https://www.alibaba.com/product-insights/ultimate-2026-guide-export-videos-from-capcut.html |
| 62 | Watermark / ending clip | Ending clip auto-added; removable by toggle or delete | Watermark removal reported as paid by some reviewers. | UNVERIFIED | https://unstar.app/blog/capcut-everything-is-pro-now-cant-export-reviews-2026 |
| 63 | Share destinations | Export screen: Save, TikTok, WhatsApp, Instagram, etc. | Save to device or direct share. | Free | https://www.capcut.com/resource/tiktok-upload |
| 64 | Cloud / Space | Space tab | Cloud projects/sync. 1 TB on Pro per reviews; free cloud storage reported discontinued about Aug 2024. | Pro | https://socialrails.com/blog/capcut-pricing-guide ; https://cursa.app/en/page/capcut-desktop-mobile-workspace-projects-media-and-cross-device-setup |
| 65 | Drafts | Home → Projects | Local drafts list, rename/duplicate/delete, multi-select. | Free | UNVERIFIED |
| 66 | Export block on premium items | n/a | Using any Pro asset can block export or trigger paywall at export, even after removal in some reports. | n/a | https://unstar.app/blog/capcut-everything-is-pro-now-cant-export-reviews-2026 |

## 8. AI audio/text tools

| # | Tool | What it does | Free/Pro | Source |
|---|---|---|---|---|
| 67 | Custom AI voice (voice clone) | Record about 30 s sample, then TTS in your voice. | Pro only | https://www.capcut.com/resource/ai-voice-cloner ; https://arwriterai.com/en/blog/capcut-ai-features-complete-guide-2026/ |
| 68 | AI script writer / Script to video | Topic in, script out. Mobile menu UNVERIFIED. | Credits | https://www.capcut.com/tools/ai-video-translator (adjacent); UNVERIFIED |
| 69 | Video translator / dubbing | Translate speech with dubbing and subtitles. Pro plus credits per one source; another says limited quota on Free. **Conflict.** | Pro/credits | https://www.capcut.com/tools/ai-video-translator ; https://arwriterai.com/en/blog/capcut-ai-features-complete-guide-2026/ |
| 70 | AI captions with emoji/highlights | Web has "Style captions with AI" (Glow, Aesthetic, Trending). Mobile emoji highlights UNVERIFIED. | Credits | https://crepal.ai/blog/aivideo/blog-ai-text-captions-capcut-guide/ |
| 71 | Smart Cut / silence remover | Remove silences automatically. | Limited on Free | https://arwriterai.com/en/blog/capcut-ai-features-complete-guide-2026/ |

## 9. Templates

| # | Tool | What it does | Source |
|---|---|---|---|
| 72 | Template (Templates tab) | Pick a template, replace its placeholder clips and text, export. Template music has licensing issues. | https://www.fleetdjradio.com/posts/are-the-capcut-template-music-copyrighted ; no mobile flow page fetched, details UNVERIFIED |

Total catalogued: 72 rows (of which about 30 are UNVERIFIED on key details).

## (a) Top 15 for ordinary short-form creators (this side of the app)

Ranked by how often the tool recurs across tutorials, official guides and review text (editorial judgement, not usage telemetry; CapCut publishes none).

1. Auto captions (#38): a whole guide and a help page; the main reason people open the app.
2. Caption styles / Apply to all (#40, #36)
3. Add text + style (#23, #25)
4. Text animations In/Out/Loop (#31)
5. Sounds library (#1)
6. Volume (#9)
7. Extract audio (#4)
8. Reduce noise (#14)
9. Beats markers (#13)
10. Fade in/out (#10)
11. Voice effects (#17)
12. Text-to-speech (#33)
13. Stickers (#45)
14. Export resolution/fps/share to TikTok (#57, #58, #63)
15. Ratio 9:16 (#56)

## (b) 2025-2026 changes older tutorials would miss

- **Tier restructure**: old Pro renamed Standard (about $9.99), new Pro about $19.99/mo or $179.99/yr, 1 TB cloud. https://socialrails.com/blog/capcut-pricing-guide. Date disputed (May 2025 vs 2026).
- **Auto captions quota** for Free (reported 5 per 30 days, account-wide, May 2026; undocumented by CapCut). https://reelvideocaptions.com/blog/capcut-auto-captions-not-free-anymore.html
- **Credit metering of AI** on every plan, so "Pro = unlimited" is wrong. https://arwriterai.com/en/blog/capcut-ai-features-complete-guide-2026/
- **Reported paywalling of formerly free items** (audio extraction, slow motion, basic animations, watermark removal, 1080p export): review-derived, the source itself says it cannot verify any specific feature was previously free. https://unstar.app/blog/capcut-everything-is-pro-now-cant-export-reviews-2026
- **Export refusal at final step** when any Pro asset remains in the project.
- **Free cloud storage discontinued** (about Aug 2024, reported).
- **AI generation models** (Seedance/Seedream) credited as flagship in 2026 (video side, outside this scope).
- **Regional availability**: the Facebook language-support list, TTS voices and caption languages vary by region; I found no authoritative list. Any region-specific US availability change in 2025-26 is UNVERIFIED.

## Gaps to close by opening the actual app

Volume/fade/speed ranges, all preset-name lists (voice effects, text animations, bubbles), font count, text Batch edit, filler-word removal, Auto lyrics on mobile, cover editor, export option labels (Recommended/Higher/Lower), free-vs-Pro gating of 4K/HDR, copyright check location, ducking toggle, number of audio tracks.
