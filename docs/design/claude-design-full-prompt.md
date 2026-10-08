> **Note for the owner (not part of the prompt).**
> This is the complete brief for Claude Design, in ONE message. Start a NEW Claude Design conversation, copy everything below the line and paste it in. It asks for the whole app design in one go — every screen and every tool — without stopping for approval.
> Attach screenshots of the current app alongside it (home, the editor with a clip selected, one open tool, export, post); the result is noticeably better with them.
> New things in it that the app does not have yet: the 4-page wizard, light appearance, a camera option and notifications. They are labelled "New feature" so they can be built later or dropped.

---

# Clipy — full iOS 27 redesign brief

You are designing the complete user interface of **Clipy**, an iPhone-only video clip editor, as a modern, native iOS 27 app. You have never seen the app and cannot read its code, so everything you need is in this brief. Text in "double quotes" is the exact wording on screen today: keep it unless a section says you may improve it. Read section 0 first: it holds decisions that are already made. Then work through the brief section by section, in the order given in section 15, and deliver the whole design in one pass.

Contents: 0 decisions already made · 1 goal · 2 product and tone · 3 Apple direction for iOS 27 · 4 hard constraints · 5 the app as it looks today · 6 icon map · 7 first-launch wizard (new) · 8 permissions · 9 screens outside the editor · 10 the editor · 11 toolbar for every selection · 12 strips · 13 panels and Crop · 14 background copies, "update needed", messages · 15 deliverables and order · 16 guard-rails · 17 references

---

## 0. Decisions already made — do not reopen these

An earlier round of this design was reviewed. These points are settled. Apply them everywhere; do not ask about them again, and where a later section of this brief says something different, this section wins.

**Deliver everything in one pass.** Do not stop for approval after the foundations. Produce all of section 15, (a) to (h), in order, in this one conversation. If you run out of room in a reply, end it with "Continued in the next message" and carry on with the next part when I say "continue" — never summarise, shorten or skip a screen, a strip, a panel or a state to save space. Collect your questions and assumptions at the very end instead of pausing for them.

**Brand and colour**
- Plain iOS controls. The nautical voice survives in only three content moments: the Home empty state, the finished export, and the app icon.
- One accent: gold `#D9B36A` as the fill of the one primary action per screen or panel, with dark ink `#1A1408` on it. For lines, selection borders, progress and on-state symbols use an "accent ink": `#D9B36A` in dark appearance, a deeper `#8B5F00` in light appearance (the gold fails as a line on white). Never use the accent as body-text colour.
- Navy is gone from the editor. The surround of the preview (`#000000`) and the timeline background (`#0E0E0F`) are hue-free and stay dark in **both** appearances, so colour can be judged the same way in light and dark. Only the chrome (header, transport, toolbar, strips, panels) follows the system appearance.
- Elevation beside the video is steps of neutral only: `#000000` → `#0E0E0F` → `#1C1C1E` → `#2C2C2E`. No shadows.
- Follow the system appearance. No in-app light / dark switch.

**Timeline bars — eight kinds, not seven**
Text, Caption, Sticker, Music, Voice, Sound effect, Layer, Effect. All share one lightness and chroma and differ in hue, with black label text. Every kind has a second cue besides colour (a glyph, and a waveform or a texture). **Caption must have its own hue, clearly different from Text** — a glyph alone is too small to tell them apart on a short bar. One selection rule for clips and for every bar: a 2-pt accent-ink border plus visible trim handles with a 44-pt hit area.

**Type**
SF Pro through Apple's text styles with Dynamic Type. No forced upper case: title-style capitals on buttons, menu items, segments and alert buttons; sentence style everywhere else. Tabular digits for every number that changes live. Toolbar and tile labels are Caption 1 (12 pt at the default size); Caption 2 is the floor.

**Home**
- The title is "Projects", a system large title.
- "Post a video" and Accounts stay as two symbol buttons in the top bar. Do not add a third button to the bottom bar.
- The bottom bar has exactly two actions: "Quick Edit" (glass) and "New Project" (the gold primary).
- A project card shows only the length pill and the cover title on the picture; the name and status sit under it; a More button opens the same menu as touch and hold (Rename, Duplicate, then Delete in red, last).
- The one-time hint on "Post a video" is an ordinary in-app callout you design (one line, a close control, shown once). **Do not use TipKit** — the app cannot.

**Editor**
- Header: system Back, the project name with a chevron that opens a menu containing Rename, and a prominent gold "Export" capsule — the editor's only primary action.
- Transport row: Undo and Redo together at the leading side, Play / Pause centred, the time and the ratio pill trailing.
- **The toolbar is ONE row and no taller than today's single-row toolbar (about 64 pt plus the Home-indicator inset).** A two-row toolbar was rejected because it takes height from the preview. Keep the tools in groups — Basics, Audio, Look, Frame, Smart for a clip — but fit the groups into the one row (for example: the row shows the group names, a tap swaps it for that group's tools with a back control; or one scrolling row with labelled dividers). Show your chosen pattern and one alternative. Delete is pinned at the trailing end and always visible. Every tool keeps a visible text label. A tool that cannot apply is left out, not dimmed; a group with nothing in it is hidden. Give a group assignment for every tool in every one of the 11 contexts.
- **The preview must stay as large as possible.** In the app every layer has its own row, songs sit right under the clips, and texts and stickers pack into rows beneath, so a real project has many rows. Design how the timeline behaves when there are many rows (thinner rows, a fixed-height timeline that scrolls vertically, a kind of row collapsing into one summary row, or a better idea) and state the minimum preview height you guarantee on the smallest iPhone. Prove it with a "full project" editor board at the smallest and the largest iPhone, dark and light: 6 clips, 5 layer rows, 2 music bars, 1 voice-over, 3 sound effects, 4 texts, 2 stickers, captions, 1 timeline effect, beat markers and two transitions.
- Timeline details that are approved: a time ruler; readable badges on clips ("1.5×", "Warm") instead of single letters; 16-pt trim handles; a transition marker on cuts that have one and a "+" on cuts that do not; a fixed white playhead at the centre.
- The selected clip shows corner handles on the frame in the preview, drawn solid. The "Preview" tag carries an info symbol and the reason ("Preview · Filter") and can be tapped for an explanation.

**Glass**
Regular glass on the editor's chrome is welcome, never over the preview frame, and clear glass is not used. Because the toolbar, strips and panels sit over a moving timeline, **draw every editor board in two versions side by side: glass, and a solid version** (`#1C1C1E` in dark, the kit's equivalent in light). The solid version must look finished — it may be the one that ships, and it is also the Reduce Transparency look.

**New features — label them**
Anything the app does not have today must carry a visible **"New feature"** label on its board and appear in one list in the hand-off sheet. Known ones: the 4-page wizard · the permissions page and the Permissions section in Accounts · camera · notifications · the optional Live Activity · light appearance · the time ruler · the "+" on cuts · corner handles in the preview · waveforms on sound bars · the tappable "Preview" tag · the project-name menu with Rename · "Posted · …" status on project cards · the More button on cards · text that follows the system text size. Where a new feature has a real fallback, also draw the screen without it (for example sound bars without a waveform).

**Symbols**
SF Symbols, outline by default; fill means on, selected or emphasis; slash means unavailable; one weight and one scale. Stabilize and Fade need custom symbols drawn on Apple's symbol template — show them at toolbar size. Mark any symbol name you could not confirm in the current SF Symbols app.

**What this design is for**
The result will be rebuilt in a React Native (Expo) iPhone app with a Swift video engine. System components (navigation bars, sheets, menus, switches, alerts, the share sheet, the photo picker) will be the real ones. So: prefer system components, keep custom parts simple and fully specified, and give every custom value a token name.

---

## 1. Role, goal and what "done" looks like

**Role.** You are the lead product designer for an iPhone app, working from Apple's own iOS 27 templates.

**Goal.** Redesign every screen and every state of Clipy so that it looks and behaves like a first-class iOS 27 app built on Apple's Liquid Glass design language, while keeping every feature, every tool and the editor's working rules exactly as they are.

**Done means all of this exists and agrees with itself:**

1. One coherent design system (colour, type, spacing, shapes, materials, icons, motion, haptics) in **dark and light** appearance.
2. A component library that replaces every component the app has today (listed in 5.4), with all states.
3. High-fidelity designs of every screen, sheet, alert, toast and empty / loading / error / busy state in sections 7–14, at the smallest and the largest current iPhone.
4. The editor in each of its 11 selection contexts, with each of its 22 strips and 12 panels open, plus the keyboard-up states.
5. The new 4-page first-launch wizard and the complete permission flows, with animation storyboards.
6. An interactive prototype of the main journey (15 f).
7. The app icon, and a hand-off sheet.

Nothing may be dropped. If something in this brief cannot be fitted, say so in your list of assumptions rather than leaving it out silently.

---

## 2. The product, the people, the tone

**The product.** Clipy is a clip editor in the spirit of CapCut. A person picks photos and videos, arranges them on a timeline, and adds text, stickers, automatic captions, music, sound effects and voice-over. They can change speed, filter and adjust colour, remove a background, stabilize shaky video, build collages, add transitions and effects, cut to the beat of the music, then export a video file and post it to YouTube, TikTok, Instagram, Facebook and X from one screen. Everything is edited on the phone; an account is needed only for posting.

**Who uses it.** People who make short videos for social media on their phone and are not professional editors. They want a good result fast, with one thumb, and they do not read manuals. The owner of the app is not a developer.

**Tone of voice.** Plain, friendly, short sentences. No jargon, no exclamation marks, no "oops". Say what happened and what to do next. Follow Apple's writing guidance (HIG "Writing"):

- Fewest words possible; verbs on buttons; "tap", never "click".
- Avoid "we"; use "your" sparingly.
- Errors sit next to the problem, blame nobody, and say how to fix it.
- Empty states give the next step, ideally with a button.
- Capitals: today the app types its labels in sentence case ("Add text", "Apply to all clips") but then draws every title and every button in UPPER CASE. **Drop the forced upper case.** Apply Apple's rule per element type and keep it consistent: title-style capitals for buttons, menu items, segmented labels and alert buttons; sentence style for messages, notes, permission text and slider labels. Labels in this brief are written as the app types them today.

**Brand.** The current look is called "Grand Voyage": deep navy, one gold accent, cream text, and a nautical theme (a compass mark, waves, "Your voyages", "Ready to sail", "EDIT · SET SAIL · SHARE"). The voice is uneven today — nautical in three places, plain everywhere else. Decide one direction and apply it everywhere: either keep a light nautical accent in a few content moments (empty states, the finished-export moment, the app icon) or go fully plain. Per Apple's branding guidance the brand should live mostly in content, not in the controls.

---

## 3. Apple design direction for iOS 27, made concrete for Clipy

### 3.1 The facts to build on

- The current iPhone system is **iOS 27** (released 14 September 2026). Its design language is **Liquid Glass**, introduced in iOS 26 and refined in iOS 27 for readability ("more uniform refraction and improved contrast"). iOS 27 also gives people a system setting that changes how glass looks, from very clear to fully tinted — so no single fixed glass appearance can be assumed.
- An app built for iOS 27 cannot opt out of the new look.
- **Build from Apple's official iOS 27 UI kit** (Figma or Sketch, links in section 17), not from memory of older iOS versions. **Wherever this brief does not give a number — margins, bar heights, corner radii, glass blur and tint values, button size names, the iPhone screen sizes, list row heights, page-control and grabber sizes — take it from that kit. Do not invent a value.** If the kit and this brief disagree about a system component, the kit wins.
- Apple publishes no guidance specific to video editors or timelines. For the editor, apply Apple's general rules for media apps (below) together with the hard constraints in section 4.

### 3.2 Liquid Glass: where it goes and where it never goes

- Glass is a **separate layer for navigation and controls that floats above content**. It is never used *in* the content layer. In Clipy the content is: the video preview, clip thumbnails, the timeline's clips and bars, project covers, text and stickers on the video, filter thumbnails.
- Standard components (navigation bars, toolbars, sheets, menus, alerts, sliders, switches) get glass from the system. Use glass on custom components sparingly, only for the most important functional elements.
- Two variants, never mixed in one place: **regular** (the default; blurs and adjusts for legibility; use wherever there is text) and **clear** (very translucent; only over rich media, only when the media may be dimmed and what sits on the glass is bold and bright). Clear glass over bright content needs a dark dimming layer at 35 % behind it.
- Never glass on glass. Things placed on glass use fills and vibrancy, not more glass. Tint glass (never an opaque fill) and only to mark the one primary action. At rest, content should not cut through a glass element.
- Do not put a solid or semi-opaque background behind controls where content scrolls under them; use the system **scroll edge effect** instead (one per view, left on automatic).
- Design and show the fall-backs the system applies: **Reduce Transparency** (frostier, more opaque), **Increase Contrast** (mostly black or white with a border), **Reduce Motion** (no elastic effects), and the user's clear-to-tinted glass setting at both ends.

How this meets the editor is in section 4 — read it before designing any editor surface.

### 3.3 Content first

The video is the hero. In the editor the preview gets as much of the screen as possible and the interface recedes. Apple accepts a permanently dark interface for immersive media; here you will still deliver both appearances (3.4), but everything that touches or surrounds the video stays neutral.

### 3.4 Colour

- Use the **system semantic colours** from the kit for backgrounds, labels, separators and fills, so base and elevated levels and both appearances work without hand-tuning. Custom colours need light, dark and increased-contrast variants.
- **One accent colour.** Today it is gold `#D9B36A` on deep navy. Keep it or evolve it — propose, and show the reasoning. Use the accent for the one primary action per screen, for selection, and for progress; never as a text colour for body copy.
- Apple's rule for colourful content applies fully: bars and control labels are **monochrome** over or beside video; colour appears only on the primary action and on status. Never give a control a colour close to the footage.
- **Neutral surround for the video.** The area around the preview, the timeline background and tool surfaces in the editor must be neutral (no hue cast) so that people can judge colour while using Filter and Adjust. Today's navy surround tints that judgement; fix it. Recommended starting point: in the light appearance the editor's preview surround and timeline still stay dark and neutral, while the chrome around them follows the system. Propose and show both appearances.
- **Never colour alone.** Today "on" is shown only by gold, problems only by red, and the seven kinds of timeline bar only by colour. Add a second cue every time (a symbol, a shape, a label, a filled state).
- Contrast: at least 4.5:1 for text up to 17 pt and 3:1 for 18 pt and larger or bold; aim for 7:1 with custom colours on small text. Check both appearances, and again with Increase Contrast.
- Do not add an in-app light / dark switch; the app follows the system setting.

### 3.5 Type

- UI font: **SF Pro**, through Apple's **text styles**, with **Dynamic Type**. Today the UI uses two custom fonts (Oswald Bold, upper-cased, for titles; Montserrat for everything else) at fixed sizes. Replace them. A custom font is allowed only for brand headings (for example the wordmark) and only if it scales with Dynamic Type and supports Bold Text.
- The text styles at the default size (size / line height in points): Large Title 34 / 41 · Title 1 28 / 34 · Title 2 22 / 28 · Title 3 20 / 25 · Headline 17 / 22 semibold · Body 17 / 22 · Callout 16 / 21 · Subhead 15 / 20 · Footnote 13 / 18 · Caption 1 12 / 16 · Caption 2 11 / 13. Minimum 11 pt. Avoid Ultralight, Thin and Light weights. Tracking values: take them from the kit.
- Design for the whole range up to the largest accessibility size (Body grows to 53 / 62 there). At large sizes stack rows, cut columns and wrap labels instead of truncating. Section 4 explains where the editor's fixed-height rows limit this and what to do about it.
- Numbers that change while a finger drags use tabular (monospaced) digits.
- The **16 fonts offered for text on the video** (13.2) are content, not UI. They stay.

### 3.6 Icons: SF Symbols

Replace the current icon set (Ionicons, outline style) with **SF Symbols** everywhere, using the mapping in section 6. One weight and scale for all interface icons, matched to the adjacent text. Outline is the default variant; fill is for emphasis and for selected / on states (which also solves "colour alone"). Use the slash variant for "unavailable". Brand logos (Google, YouTube, TikTok, Instagram, Facebook, X) are those companies' own artwork under their guidelines, not SF Symbols. Empty states today use large emoji (🏝️, 🎞️) and Templates uses a dice emoji: replace these with symbols or a small illustration style of your own, used consistently.

### 3.7 Shapes, layout, touch

- Shapes follow Apple's three kinds: capsule (buttons, sliders, switches, bars), fixed radius, and **concentric** (inner radius = outer radius minus padding). Controls near the screen edge are capsules with margin; nested content uses concentric corners. Controls inside a bar are concentric with the bar.
- Respect the safe areas (Dynamic Island, Home indicator) and the system margins from the kit.
- **Every touch target is at least 44 × 44 pt.** Several current ones are far smaller (10.6 lists them); fix them all.
- Put the most used controls in the lower half of the screen, within thumb reach. Keep the back swipe working.

### 3.8 Use the native component wherever one exists

| Need | Use | Notes for Clipy |
|---|---|---|
| Screen header | System navigation bar / toolbar with glass button groups | Standard circular Back and Close buttons (no "Back" text). At most three groups; never mix a text item and a symbol item in one group; one prominent primary action on the trailing side. Titles under 15 characters, never the app name. Less used actions go in a More (`ellipsis`) menu. |
| Short self-contained task outside the editor | System sheet with detents (medium / large, grabber) | Aspect ratio, Quick edit, YouTube options, the sign-in page when opened later. Cancel leading, Done trailing; in multi-step sheets Back replaces Cancel after step one. One sheet at a time. Half sheets are inset with large corners in the current system. |
| Actions on one item | Context menu (touch and hold) **plus** a visible way to the same actions | Project cards today hide Rename / Duplicate / Delete behind an unmarked long press. Menu items: verb first, destructive last and red, unavailable items hidden. |
| Pick one of a few | Segmented control (about five segments at most, text or symbols, never both) | Tabs inside tools: "In / Out / Combo", "Normal / Curve / Slow motion", "Emoji / Shapes", "Music / Files / Effects / Record", alignment, "This clip / Whole project". |
| Pick one from a short flat list | Pop-up button / menu | Export options are candidates; language and voice in Read aloud. |
| A value in a range | System slider (live feedback while dragging; pair with a number field where exact values matter) | Every adjustable value in the editor. See constraint 8 in section 4. |
| On / off | System switch inside a list row; outside a row, a toggle button whose "on" state is a filled background | Today a raw switch is used in seven tools next to gold-ringed chips doing the same job: make one rule. |
| Text entry | System text field with a visible label, placeholder and Clear button | Email, code, caption, titles, the text editor. |
| Search | System search field | Emoji search; a project search on Home if you add one (9.2). |
| Confirm a destructive choice | Confirmation dialog (action sheet) opening from the control that triggered it; alert only for essential information | "Delete project?", "Stop posting?", "Disconnect {platform}?", "Sign out of Clipy?", "Large file". Destructive at the top and red, "Cancel" at the bottom. No Yes / No. |
| Progress | Determinate indicator whenever the length is known, always in the same place, with Cancel | Export, uploads, every background copy (section 14). |
| Sharing | System share sheet from the standard Share button (`square.and.arrow.up`) | Export and Post. |
| Choosing photos and videos | System photo picker | It is Apple's surface; do not redraw it. Per Apple it needs no photo-library permission and returns only what the person picks (see 8.2). |
| Choosing a file | System Files picker | "Import from Files" — needs no permission. |
| Signing in with Apple | Apple's own button | Allowed titles: "Sign in with Apple", "Sign up with Apple", "Continue with Apple" — Clipy uses "Continue with Apple". Styles: black, white, white with outline; pick by background. At least 140 × 30 pt (iOS default height 44 pt), clear margin at least a tenth of its height, corner radius matched to the other buttons, no smaller than any other sign-in button, visible without scrolling. Use Apple's Sign in with Apple template (section 17). |
| Teaching a hidden gesture | TipKit-style tip in context | Pinch to zoom the timeline, drag / pinch / twist on the preview, touch and hold on a project. |

**Do not add a tab bar.** Clipy has one top-level place (the project list); Apple reserves tab bars for moving between top-level sections and never for actions.

### 3.9 Motion and haptics

- Motion is brief, purposeful, follows the gesture and never carries information alone. People can act without waiting for it. Do not add custom animation to frequently repeated interactions; system components already animate. Apple gives no durations in milliseconds, so use the system's own transitions from the kit and the app's own budget from section 4 for anything beside the video.
- Menus and dialogs open from the control that owns them; controls morph between states.
- SF Symbol animations, each with one meaning: replace (state change, play ↔ pause), bounce (something happened), pulse or breathe (ongoing activity such as recording), variable colour (progress), scale (selection). Use sparingly.
- **Reduce Motion:** no automatic or repeating animation, no zoom or scale, slides become fades, nothing animates into or out of a blur.
- Haptics, with Apple's meanings only: *selection* for a value changing under the finger (slider crossing its rest value, entering a snap on the timeline); *impact light* for a small action landing (split, apply, choose a preset); *impact medium* for a destructive action (delete); *notification success* for export finished and a platform posted; *notification error* for a failure. Never the same pattern for good and bad. No haptics while the microphone is recording.

### 3.10 Accessibility

Design, and show at least one screen for each: VoiceOver labels for every control and a unique title per screen; Dynamic Type at the default, the largest standard and the largest accessibility size; Reduce Motion; Reduce Transparency; Increase Contrast; Bold Text; Differentiate Without Colour. Every gesture has an on-screen alternative. Nothing auto-dismisses if it carries something the person must read or act on (today's toasts do — see 14.4).

### 3.11 App icon

Design the icon as layers for **Icon Composer**: one background layer plus one or more foreground layers; simple filled overlapping shapes with clear edges; 1024 × 1024 px square, unmasked (the system rounds it); no highlights, shadows, bevels, blurs or glows of your own; no photos, screenshots or interface replicas; text only if essential. Supply all six appearances: default, dark, clear light, clear dark, tinted light, tinted dark, keeping the core shape the same in each. The current mark is a compass (a gold ring with a red / cream needle) — keep, evolve or replace it, and show why. Use Apple's iOS 27 App Icon Template (section 17).

### 3.12 Optional: Live Activity and Dynamic Island (new)

An export or an upload can take minutes. As an **optional, new** addition, design a Live Activity for "Exporting" and "Posting": compact, minimal, expanded and Lock Screen presentations from Apple's Live Activities template; only information about that task (name, percent, time left if known); at most one control (Cancel); text Medium weight or heavier; the Dynamic Island keeps its black background; animations at most 2 seconds; it ends the moment the task ends; never both a notification and a Live Activity update for the same event. Mark it clearly as optional in your delivery.

---

## 4. Hard constraints of the editor — the redesign must respect these

These come from how the app works, not from taste. You may change every colour, shape, font and icon, but not these. Each has its reason.

| # | Constraint | Why |
|---|---|---|
| 1 | **iPhone only, portrait only.** No iPad, no landscape, no Android, no web. One layout must work from the smallest to the largest current iPhone (roughly 375 × 667 pt without a Home indicator up to roughly 440 × 956 pt — confirm the exact sizes in Apple's kit). Apple's folding iPhone (iPhone Duo) is out of scope: do not design fold layouts; just avoid fixed widths. The interface is English only; no right-to-left layouts are needed, but do not design anything that would prevent them. | The app is built and tested for these phones only. |
| 2 | **The video preview stays in one fixed place** in the editor. It is never covered, moved or resized by an animation, and nothing that animates may wrap it or the timeline. | The video player must never be rebuilt or stutter while editing. |
| 3 | **Tools open inline, under the preview — never as modal sheets, never with dimming.** There are exactly two containers. A **strip** is short and of fixed height (today a header, one row of tiles, one slider row); it replaces the toolbar while the timeline stays visible and usable; it never scrolls vertically. A **panel** is tall; it replaces the toolbar *and* the timeline; its body scrolls (a compact panel has fixed rows and does not). The one exception is Crop, which is a full screen. | The person must see the result on the video while they change it, and keep scrubbing. |
| 4 | **One tool open at a time.** Opening is "select first, then open". **Closing is instant** — no closing animation and no "closing" state. A tool closes itself when the selection changes, the selected item is deleted or undone away, multi-select starts, or Export is tapped. | Keeps the editor's state simple and fast. |
| 5 | **Every row inside a strip or panel has an explicit height.** A design that needs content-driven height inside a strip is not possible. While the keyboard is up, a panel becomes short (about a fifth of the screen) and sits on the keyboard, and its tab row and pinned area are hidden. | Layout must be stable beside the video. |
| 6 | **The bottom toolbar is contextual.** It shows only the tools that apply to what is selected; a tool that cannot apply is left out, not shown disabled. | There are too many tools to show them all. |
| 7 | **Motion budget beside the video:** only opacity and position / scale; at most 250 ms; nothing looping; no layout animation; nothing animated when list items appear or disappear. Only a tool's *content* may fade in on opening — its container is in place from the first frame. | Anything more costs frames of video playback. |
| 8 | **Sliders act live** on the video while dragged; nothing else may animate or start heavy work during a drag. The slider is the system control (tinted); its "rest" value gives a haptic tick; its track is not restyled per tool. One drag is one undo step. | People judge by eye while dragging. |
| 9 | **No shadows, glows or blur over the video.** Inside the preview frame, layering is by solid colour or a plain scrim. | Blur and shadows over a playing video are costly and change how the footage looks. |
| 10 | **One primary (filled) button per screen or per panel.** (Accounts has none, on purpose.) | One obvious next step. |
| 11 | **Seven kinds of timeline bar** (text, sticker, music, voice, sound effect, layer, effect) must stay distinguishable on the timeline — by colour **and** a second cue. | The timeline is read at a glance. |
| 12 | **Text and stickers on the video** use their own 16 bundled fonts and are positioned as fractions of the frame. | They are content and are exported. |
| 13 | **Background copies never block editing.** Some results are prepared in the background as a copy of the media (section 14.1). Until a copy is ready the preview keeps showing the previous version, a "Preview" tag marks an approximate picture, and the person can keep editing. Each needs a waiting, progress, ready, failed and off state. | Editing must stay responsive on a phone. |
| 14 | **Navigation between screens is the system's own:** push from the right, modal sheet from the bottom, system alerts, pickers and share sheet. No custom screen transitions; never animate or wrap the editor screen. Leaving the editor always saves; the back swipe in the editor starts from the left edge only. | Reliability, and the gestures must not fight the timeline. |
| 15 | **Signing in is optional** and only needed for posting. First launch must offer "Continue without an account". | Editing never depends on an account. |
| 16 | **Home is inert while a project is being created** (copying media takes seconds) and must show that something is happening. | Prevents double creation. |
| 17 | **Export** must show options, progress with Cancel (and cannot be dismissed while rendering), done and error. **Post** must show per-platform progress, errors with Retry / Resume / Reconnect, and standing notes per platform. | These are long tasks that can fail in parts. |

### How Liquid Glass adapts to these constraints

- **Glass is welcome on the editor's chrome:** the header's button groups, the bottom toolbar, strips and panels can be system glass or a system material. This is what makes the editor feel like iOS 27.
- **Glass must never blur the video itself.** No glass element may overlap the preview frame at rest, and nothing inside the frame (the "Preview" tag, selection frames, handles, badges) uses blur — use a solid fill or a plain scrim there.
- **A strip rises over the lowest rows of the timeline** (by up to 64 pt today). If the strip is glass, moving timeline bars will show through it: every label and value in the strip must stay legible over that movement. Use the regular variant, test it over the busiest timeline, and deliver a solid version too (it is also the Reduce Transparency look). Flag this as a point the developers must confirm on a real phone for performance; if it fails, the solid version ships.
- **Colour next to the picture stays neutral** (3.4), so glass there must not carry a tint except on the one primary action.
- **Dynamic Type versus fixed rows.** Strips keep fixed heights. Design each strip at the default and the largest standard text size and state what happens above that: propose a small set of fixed strip heights (for example default and large-text) rather than content-driven height, and use the system's large-content viewer for toolbar and tile labels at accessibility sizes. Panels scroll, so their content may grow freely.

---

## 5. The app as it looks today (your starting point)

### 5.1 Colour — dark only, no light theme, no translucency

| Role | Value | Used for |
|---|---|---|
| Page | `#0A1B33` → `#0C2542` (vertical gradient) | Every screen |
| Page, deeper | `#081527` | Timeline background, letterbox |
| Surface | `#0E2440` | The preview frame's fill |
| Bar | `#112C4D` | Bars, strips, panels, sheets, cards |
| Tile | `#17365C` | Tiles, chips, text fields, toast, ring track |
| Lifted | `#1F4572` | The selected tile / chip |
| Accent (gold) | `#D9B36A` | The one main button, selection rings, "on" icons, slider fill and thumb, progress, text-only buttons |
| On accent | `#0A1B33` | Text and icons on a gold button |
| Text | `#F6E7C1` (cream) | All primary text and icons |
| Text, muted | `#9FB3CC` | Labels, notes, placeholders |
| Hairline | gold at 45 % | 1-pt borders, separators, outlined buttons |
| Sea / sea light | `#1C6E9E` / `#2E86AB` | The unfilled slider track; the waves |
| Danger / danger text | `#E5484D` / `#F47A7E` | Red fills and borders / red text |
| Scrim / strong scrim | dark navy at 55 % / 75 % | Behind a sheet / badges over pictures |
| Timeline bar colours | text `#D9B36A`, sticker `#E86A7A`, music `#3BA7C9`, effect `#9A86D6`, voice `#4FA89B`, sound effect `#E0916A`, layer `#7F93B8` | One per kind of bar (note: text uses the same gold as the accent) |

Depth today is by colour steps only (page → bar → tile → lifted); there are no shadows and no blur anywhere.

### 5.2 Spacing, shapes, sizes

Spacing scale 4 / 8 / 12 / 16 / 24 / 32, screen gutter 16. Radii: card 12, chip and field 8, tool box 14, project cover 16, sheet top 18, pill for buttons. Sizes: button 48 (compact 36), icon button 40, tool button a 44-pt box in a 72-pt column, chip 36 (compact 28), row 48, strip / panel header 44, round Done button 32, list row 56, export ring 120, icons 16 / 20 / 24. Selection is a 2-pt gold ring. Replace these with the kit's values where a system component takes over; keep a small, regular spacing scale of your own for custom parts.

### 5.3 Type and motion

Type sizes today: 11 / 12 / 13 / 14 / 16 / 18 / 20 / 26, plus strays (15, 16, 22, 48). The 11-pt label under every tool and tile is the smallest and the most used text in the app. Motion today: press dip to 96 % over 120 ms; selected items grow 3 %; content fades in and rises 8 pt over 180 ms; tools close instantly; toasts fade; sheets rise on a spring without bounce. Under Reduce Motion things simply appear.

### 5.4 The components to replace (all of them, with all states)

| Component today | What it is | Where |
|---|---|---|
| Screen | Full-screen gradient with safe-area padding | Every screen |
| Title / Body / ValueLabel | Title (upper-cased), body text in three weights, and "name + value" in one line ("Opacity 40 %") | Everywhere |
| PrimaryButton | Gold pill, 48 pt (compact 36), dark label, optional leading icon; 40 % when disabled | One per screen or panel |
| SecondaryButton | Outlined pill, cream label; a red variant | Everywhere |
| QuietButton | Text only, gold; a red variant | Header actions, "Sign out", "Delete", "Done" |
| IconButton | A bare 24-pt icon in a 40-pt box; 35 % when disabled | Headers |
| DoneButton | A 32-pt circle with a gold ring and a tick — closes a strip or panel | Every strip and panel |
| ToolButton | A 44-pt rounded box with a 20-pt icon over an 11-pt one-line label; active = ring, lighter box, gold; 35 % when disabled | The editor's bottom toolbar |
| Tile | Same shape as ToolButton for pick-one choices; the box holds an icon or a small drawing | Strips, Quick edit |
| Chip | A pill (36 / 28 pt); selected = ring, lighter fill, gold label | Options, tabs, toggles |
| Slider | System slider tinted gold on a blue track; haptic tick at the rest value | Every adjustable value |
| Switch | The plain system switch | Seven editor tools |
| Field | Text box, no border, no label of its own | Email, code, caption, titles, text tools |
| NumField | A small label over a compact number box; applies when focus leaves | Trim, Fine-tune, Caption style |
| Card | Bar-coloured box with a hairline | Accounts, Post, Export |
| Sheet | The app's own dimmed bottom sheet with a grabber and a title row | Home and Post only — never in the editor |
| ToolStrip | The inline short tool area (constraint 3) | Most editor tools |
| ToolPanel | The inline tall tool area (constraint 3): regular = 46 % of screen height (300–430 pt), compact = 240 pt, typing = 22 % of screen height (148–200 pt) | The tall editor tools |
| Toast | One pill message near the bottom, 2.5 s, not tappable | Every screen |
| Spinner | The system activity indicator, gold | Loading states |
| ProgressRing | 120-pt ring with the percentage or a tick inside | Export |
| EmptyState | A large emoji, a title, one hint line | Home, broken Post link |
| RatioShape | A small outlined rectangle drawn at an aspect ratio (dashed for Auto) | Aspect-ratio pickers |
| Compass | The brand mark | Launch, Export button |
| Waves | Two scrolling wave bands | Launch only |
| LoadingScreen | The brand screen shown at launch | Launch |
| Colour row | Eight round swatches plus a "#RRGGBB" field | Text, stickers, caption style |
| Press / enter behaviours | Press dip; fade-and-rise on appear | Everywhere |

Known inconsistencies to resolve in the library: the tool button and the tile are two near-identical components; there are two text boxes with different padding; destructive actions appear in three forms (red text button, plain gold text button for "Sign out", red outlined button); the primary action sits in a different place on almost every screen; value formats differ ("100%", "100 %", "100", "0.50 s", "0.0 s", "1.5×") — choose one format per unit; "pick one" is done four different ways (icon tiles, text chips, picture tiles, bare colour circles).

---

## 6. Icon map: current icon → meaning → suggested SF Symbol

The symbol names below are suggestions. **Confirm each one exists in the current SF Symbols app** (Apple's page names the download "SF Symbols 27" without printing a version name); where a name is missing, take the nearest symbol or draw a custom symbol on Apple's template. Apple's own standard names are marked ★ — use those exactly.

**General and navigation**

| Meaning | Current icon | Suggested SF Symbol |
|---|---|---|
| Back | chevron-back-outline | system Back button (`chevron.backward`) |
| Close | close-outline | `xmark` ★ |
| Done / confirm | checkmark-outline | `checkmark` ★ |
| Add | add-outline | `plus` ★ |
| More | — | `ellipsis` ★ |
| Share | — | `square.and.arrow.up` ★ |
| Undo / Redo | arrow-undo-outline / arrow-redo-outline | `arrow.uturn.backward` ★ / `arrow.uturn.forward` ★ |
| Play / Pause / Stop | play, pause, stop (filled) | `play.fill` / `pause.fill` / `stop.fill` |
| Post a video | paper-plane-outline | `paperplane` |
| Accounts | person-circle-outline | `person.crop.circle` |
| Email | mail-outline | `envelope` |
| Error | alert-circle-outline | `exclamationmark.circle` |
| Missing file | warning (filled) | `exclamationmark.triangle.fill` |
| Checkbox off / on / done | square-outline / checkbox-outline / checkmark-circle-outline | `square` / `checkmark.square.fill` / `checkmark.circle.fill` |
| Disclosure | chevron-down-outline / chevron-up-outline | `chevron.down` / `chevron.up` |
| Move clip (reorder) | reorder-two-outline | `line.3.horizontal` |
| Rename | — | `pencil` ★ |
| Search | — | `magnifyingglass` ★ |
| Quick edit styles | airplane / balloon / leaf / film / radio / videocam (outline) | `airplane` / `balloon` / `leaf` / `film` / `radio` / `video` |

**Editor toolbar (label → symbol)**

| Label | Current icon | Suggested SF Symbol |
|---|---|---|
| Edit (main bar) | film-outline | `film` |
| Audio | musical-notes-outline | `music.note` |
| Text | text-outline | `textformat` |
| Stickers | happy-outline | `face.smiling` |
| Overlay | layers-outline | `square.on.square` |
| Collage | grid-outline | `rectangle.split.2x2` |
| Effects | flash-outline | `bolt` |
| Filter | color-filter-outline | `camera.filters` |
| Adjust | options-outline | `slider.horizontal.3` |
| Ratio | phone-portrait-outline | `aspectratio` |
| Background | color-palette-outline | `paintpalette` |
| Cover | image-outline | `photo` |
| Templates | color-wand-outline | `wand.and.stars` |
| Add audio / Add text | add-circle-outline | `plus.circle` |
| Ducking | volume-low-outline | `speaker.wave.1` |
| Beats | pulse-outline | `metronome` |
| Captions | chatbox-ellipses-outline | `captions.bubble` |
| Split | cut-outline | `scissors` ★ |
| Trim | code-outline | `timeline.selection` |
| Select | checkmark-done-outline | `checkmark.circle` ★ |
| Select all | albums-outline | `checklist` |
| Speed | speedometer-outline | `speedometer` |
| Volume (clip / sound bar) | volume-high-outline / volume-medium-outline | `speaker.wave.3` / `speaker.wave.2` (use one for both) |
| Extract audio | git-branch-outline | `waveform.badge.plus` |
| Voice | mic-outline | `mic` |
| Sound | stats-chart-outline | `waveform` |
| Fade | trending-up-outline | a custom "fade ramp" symbol, or `chart.line.uptrend.xyaxis` |
| Animate | sparkles-outline | `sparkles` |
| Motion | move-outline | `arrow.up.and.down.and.arrow.left.and.right` |
| Crop | crop-outline | `crop` |
| Transform | resize-outline | `crop.rotate` |
| Opacity | contrast-outline | `circle.lefthalf.filled` |
| Mask | ellipse-outline | `circle.dashed` |
| Blend | color-fill-outline | `square.2.layers.3d` |
| Green screen | leaf-outline | `eyedropper.halffull` |
| Cut out | body-outline | `person.and.background.dotted` |
| Stabilize | hand-left-outline | no exact match — propose (for example `camera.viewfinder`) or draw a custom symbol |
| Keyframe (off / on) | diamond-outline / diamond | `diamond` / `diamond.fill` |
| Transition | swap-horizontal-outline | `arrow.left.arrow.right` |
| Replace | sync-outline | `arrow.triangle.2.circlepath` |
| Reverse | play-back-outline | `backward` |
| Freeze | snow-outline | `snowflake` |
| Forward / Back (layer order) | arrow-up-outline / arrow-down-outline | `square.2.layers.3d.top.filled` / `square.2.layers.3d.bottom.filled` |
| Duplicate | copy-outline | `plus.square.on.square` ★ |
| Delete | trash-outline | `trash` ★ |
| Edit (text, caption, sticker) | create-outline | `pencil` |
| Strength | speedometer-outline | `dial.medium` |

Inside strips and panels, tiles carry more icons (the 20 effects, the animation lists, voice and sound presets, and so on; all are named in sections 12 and 13). For those, prefer a **small drawing or live thumbnail of the result** over a generic symbol where it helps the choice; otherwise pick a matching SF Symbol. Today the mic and stop glyphs on the Record button, play / pause, warning badges and timeline bar glyphs are filled while everything else is outline: make the rule "outline by default, fill for on / selected / emphasis" and apply it everywhere.

---

## 7. The first-launch wizard (new — design it fully)

### 7.1 What it is and how it relates to the current app

Today, on first launch, the app draws its **welcome / sign-in page** full screen in place of Home; it can be skipped with "Continue without an account". The wizard **replaces that first-launch presentation** with four pages. It is shown once, on the first launch only. The **stand-alone sign-in page still exists** (9.1): it opens later as a sheet from Accounts, from the sign-in card on Post, and it is the app's only sign-in page — the wizard's page 4 is that same page's first step, shown in the wizard's frame.

Per Apple's onboarding guidance the wizard is optional, short and skippable; it teaches what is special about this app, never how iOS works; and it contains no licence text.

### 7.2 Shared frame

- Four pages, swiped horizontally, with the **system page control** (dots) from the kit above the buttons. Swiping, tapping the dots and the primary button all move between pages.
- Top trailing: a text button "Skip" on pages 1–3. It jumps to page 4 (sign in), which has its own way out. Top leading on pages 2–4: the system Back button.
- Bottom: one primary button, full width, in thumb reach. Apple's flow words: "Get Started" → "Continue" → "Start editing".
- Upper two thirds of each page: an **animated illustration built from Clipy's own interface** — miniature, simplified pieces of the redesigned editor (clip thumbnails, the timeline, the preview frame, a caption bar). No stock art, no photos of people from a library, no device mock-ups. Use neutral placeholder footage.
- Below it: a headline (Title 1 or Large Title, left-aligned or centred — follow the kit) and one line of body copy (Body, secondary colour).
- Background: the system background; the illustration is content, so no glass inside it. Buttons use the system's prominent style.
- The page works at every Dynamic Type size: at large sizes the illustration shrinks first, then the page scrolls.
- VoiceOver: each illustration has one spoken description; the page announces "Page 2 of 4".

**Animation rules for all four pages.** The wizard is not beside a video, so the 250-ms editor budget does not apply here — but keep it calm. Each illustration plays **once** when its page becomes current, then rests on its final frame; it replays if the page is revisited. Individual moves use the system's standard spring or ease-out from the kit, 250–400 ms each, staggered by about 80 ms; a whole sequence lasts 3–5 seconds. Nothing loops for ever. The timings in this section are proposals: refine them in the storyboard and list the final values in the hand-off sheet. **Reduce Motion:** no movement; show the final still frame, or step between stills with a 200-ms cross-fade. Page changes themselves use the system paging behaviour.

### 7.3 Page 1 — Welcome

- **Purpose:** say what Clipy is in one glance.
- **Headline:** "Make clips worth sharing"
- **Body:** "Edit, caption and post your clips." (the app's existing tagline)
- **Illustration and motion (about 3.5 s):** an empty preview frame and an empty timeline. Three clip thumbnails drop into the timeline one after another (each 300 ms, 80 ms apart); the playhead sweeps across them (1.2 s, linear); as it passes, a title text pops onto the preview and a music bar slides in under the clips (300 ms each); the frame settles. **Reduce Motion:** the finished still (three clips, a title, a music bar).
- **Controls:** primary "Get Started"; "Skip".

### 7.4 Page 2 — What you can do

- **Purpose:** show the four things that set Clipy apart, in motion.
- **Headline:** "Big edits, one tap"
- **Body:** "Cut to the beat, remove a background, add captions and steady a shaky shot."
- **Illustration and motion (four scenes of about 2.5 s each, one after another, then rest on a 2 × 2 summary):**
  1. *Cut to beats* — beat ticks appear along the top of a timeline; the ends of three clips snap to the nearest tick, one by one (250 ms each, with the snap guide line flashing).
  2. *Remove background* — a simple figure on a busy background; the background fades away leaving the figure on a plain colour (500-ms cross-fade), with a small progress line counting to "Ready."
  3. *Captions* — a caption bar appears at the bottom of the preview and its words appear one at a time, the spoken word highlighted.
  4. *Stabilize* — a frame that jitters by a few points for a second, then settles and zooms in very slightly.
  A four-segment progress line under the illustration shows which scene is playing; tapping a segment jumps to it. Scene captions: "Cut to beats", "Remove background", "Captions", "Stabilize".
- **Reduce Motion:** the 2 × 2 grid of four labelled stills, no auto-advance.
- **Controls:** primary "Continue"; "Skip".

### 7.5 Page 3 — Permissions

- **Purpose:** offer, up front and without pressure, the permissions Clipy can use. Full rules and every state are in section 8.
- **Headline:** "You decide what Clipy can use"
- **Body:** "Allow these now or later. Editing works either way."
- **Content:** a grouped list, one row per permission (8.3): a symbol, the name, one line saying what it is for, and on the trailing side either a button "Continue" (state: not asked) or a status ("Allowed", "Limited", "Off"). Tapping "Continue" on a row shows Apple's system alert for that one permission. Nothing is asked when the page appears, and never two alerts in a row.
- **Illustration and motion:** no large illustration; the list is the content. Rows fade in and rise 8 pt, 60 ms apart (about 600 ms in all). When a row's state changes, its symbol swaps with the SF Symbols "replace" effect and the status text cross-fades (200 ms); a selection haptic. **Reduce Motion:** rows simply appear; the symbol and text change without animation.
- **Controls:** primary "Continue" (always enabled, whatever was or was not allowed); the top-trailing button reads "Skip for now" on this page. Both go to page 4.

### 7.6 Page 4 — Sign in

- **Purpose:** offer an account, which is needed only for posting.
- **Headline:** "Sign in to post"
- **Body:** "You only need an account to post. Editing works without one." (existing wording)
- **Controls — exactly the existing welcome page's options and wording, in this order:**
  1. Apple's own "Continue with Apple" button (the visual primary of this page, so there is no accent-coloured button beside it). Hidden on a phone where Apple sign-in is unavailable; its slot keeps its height while the app is still checking.
  2. "Continue with Google" (Google's logo).
  3. "Continue with email" → the email step and then the code step (9.1), shown inside the wizard's frame with the system Back button.
  4. Text button "Continue without an account" → Home.
- While a sign-in runs: an activity indicator in a fixed slot under the body copy, and every button inert.
- **After a successful sign-in** the button stack is replaced by a short confirmation — a tick, "Signed in as {email}" — and the primary button **"Start editing"** → Home.
- **Illustration and motion (about 2 s):** the five platform marks (YouTube, TikTok, Instagram, Facebook, X) rise in a small arc above a finished clip thumbnail, 80 ms apart, as if the clip is being sent to each. On success the tick draws on (SF Symbols "draw on") with a success haptic. **Reduce Motion:** the still, and the tick simply appears.
- **Where it ends:** Home with its empty state (9.2), ready for the first project.
- All sign-in messages from 9.1 apply here unchanged.

---

## 8. Permissions — the complete flow

### 8.1 Rules (state these in your designs' annotations)

1. **Apple's system alert is Apple's.** It cannot be restyled, re-worded beyond the app's one purpose sentence, pre-answered or imitated. Never draw a fake alert or a picture of the system alert inside the app. Take the alert's exact layout and button wording from Apple's kit.
2. **No permission is ever required to continue.** "Skip for now" is always available, and the app must work in a reduced way without each permission (8.3 says what still works).
3. **Ask once, in context.** Each permission is offered on the wizard's page 3; if it was skipped there it is asked the first time the feature that needs it is used. Never show two system alerts in a row, and never ask again straight after a refusal.
4. **The app's own explanation comes first** and is honest and specific: a headline and one sentence. Per Apple, its button says "Continue" (or "Next") — never "Allow" — it offers no reward for agreeing and no second "Cancel" button of its own; leaving is done with the page's ordinary Skip / Back / Close. Where the context already makes the reason obvious (tapping the record button), go straight to the system alert with no screen in between.
5. **The purpose sentence inside Apple's alert** is one specific sentence, sentence capitals, active voice, with a full stop.
6. **After a refusal** the feature shows a friendly inline state — what is missing, what still works, and a button "Open Settings" — not a toast. (Today a toast says "Open Settings to allow it." but cannot be tapped; fix that.)
7. Apple's guidance prefers asking at first use rather than during onboarding. The wizard's page therefore only *offers*: it asks nothing until the person taps a row.

### 8.2 Important facts about photos

- Clipy picks media through the **system photo picker**. Per Apple's documentation the picker runs outside the app, needs no photo-library permission, and gives the app only what the person picks. Today the app nevertheless asks for library access before opening the picker and stops if it is refused.
- Design the flow the owner asked for — full library access explained and encouraged — **and** an honest fall-back: when access is limited or refused, importing still works through the system picker, one selection at a time. Mark this fall-back as needing the developers' confirmation.
- The exact names and layout of the system's photo choices (full access, limited access, don't allow, and the "add more photos" screen) were not confirmed in research for this brief: **take them from Apple's kit**, and use the same words in the app's own rows.

### 8.3 Each permission

| Permission | Used for | First asked in context when | Without it, what still works |
|---|---|---|---|
| **Photos and videos** (read) | Importing clips for a project, Quick edit, adding clips, Overlay, Collage, Replace, picking a video to post | "New project", "Quick edit", "Post a video", or the add-clip tile is first tapped | Limited: everything, with the chosen items. Refused: import through the system picker (see 8.2); editing existing projects; importing audio from Files |
| **Save to Photos** (add only) | "Save to Photos" on Export and on Cover | The first "Save to Photos" tap | "Share" still works (save to Files, AirDrop, any app) |
| **Camera** (new — see note) | Recording a photo or video straight into a project | The first "Take photo or video" tap | Everything else; import from Photos and Files |
| **Microphone** | Recording a voice-over; sound when recording with the camera | The first tap on the record button in "Add audio" → "Record" | Everything else; music, sound effects, audio from Files, Read aloud |
| **Speech recognition** | Automatic captions ("Transcribe") | The first "Transcribe" tap | Everything else; captions can still be typed as text and styled |
| **Notifications** (new — see note) | Telling the person an export or an upload finished while the app is in the background | After the first export starts, as an inline offer on the progress state — not as an interruption | Everything; progress is simply shown in the app |
| **Files** | "Import from Files" (audio today: "Choose a file") | — | **Needs no permission.** Show it as an always-available row: "Import from Files — no permission needed" |

Not used, so never asked: the Music / media library (music comes from the app's bundled tracks or from Files), Contacts, Location, Tracking.

**Note on the two new items.** The app has no camera capture and no notifications today; the owner has asked for them to be part of the permission flow. Design them as new, clearly labelled additions: "Take photo or video" as one more source wherever media is added (the New project start, the editor's add-clip tile), opening the **system camera interface** (do not design a custom camera); and one "export finished" / "upload finished" notification. List both under "departures from the current app" in the hand-off.

**The app's own explanation and the purpose sentence**

| Permission | Headline | One sentence (the app's own explanation) | Purpose sentence inside Apple's alert |
|---|---|---|---|
| Photos and videos | "Use your photos and videos" | "Clipy needs your library to bring photos and videos into a project. Full access makes picking faster; you can also choose just some." | Proposed: "Clipy uses the photos and videos you choose to make your clips." (today: "Clipy needs access to your videos to import clips.") |
| Save to Photos | "Save finished videos" | "Clipy saves the videos and covers you export to your Photos." | Proposed: "Clipy saves your exported videos and covers to Photos." (today: "Clipy saves exported videos to your Photos.") |
| Camera (new) | "Record with the camera" | "Clipy uses the camera only while you record a photo or video for a project." | Proposed: "Clipy uses the camera to record photos and videos for your clips." |
| Microphone | "Record your voice" | "Clipy uses the microphone only while you record a voice-over." | Today: "Clipy uses the microphone to record voice-overs and to make captions from speech." Keep, or shorten to "Clipy uses the microphone to record voice-overs." if the developers confirm captions do not need it. |
| Speech recognition | "Turn speech into captions" | "Clipy listens to the speech in your clips on this iPhone and writes it as captions." | Today (keep): "Clipy turns speech in your clips into captions." |
| Notifications (new) | "Know when it's done" | "Clipy can tell you when an export or an upload finishes." | The system's notification alert does not show an app-written sentence as far as this brief knows — confirm in Apple's kit; the app's own explanation therefore carries the reason. |

### 8.4 The states to design for every permission

Design each as (a) a row on the wizard's page 3 and in Accounts (8.5), and (b) the inline state inside the feature that needs it.

| State | Row shows | Inside the feature |
|---|---|---|
| **Not asked** | Symbol, name, one-line purpose, button "Continue" | The app's explanation (8.3) with "Continue", or straight to Apple's alert where the context is obvious |
| **Allowed** | A filled tick and "Allowed" | The feature just works; nothing extra on screen |
| **Limited** (Photos only) | A half-filled mark and "Limited", with two actions: "Choose more photos" (opens the system's own screen for adding to the selection) and "Allow full access" (opens Settings) | Above or beside the import entry: one line, "Clipy can see only the photos you chose.", with the same two actions. Never nag; show it once per import, dismissible |
| **Denied** | A slashed symbol and "Off", button "Open Settings" | A friendly inline state in place of the feature's main control: a symbol, a headline (for example "Microphone is off"), one sentence saying what still works, and the button "Open Settings". Existing wording to carry over or improve: "Clipy needs Photos access to import photos and videos. Open Settings to allow it." · "Clipy needs Photos access to post a video. Open Settings to allow it." · "Allow Photos access in Settings to save." · "Microphone access is needed to record." · "Clipy needs Speech Recognition permission to transcribe your clips. Turn it on in Settings, then try again." with "Open Settings" |
| **Restricted** (blocked by the phone's owner or organisation; the person cannot change it) | A lock symbol and "Not available on this iPhone", no button | The same inline state without "Open Settings", saying the setting is managed on this iPhone |

Also design: returning from Settings (the row and the feature update at once, no restart message); the "Limited" row after more photos were added; and the wizard page with every row in a different state.

### 8.5 "Permissions" section on the Accounts screen

Add a "Permissions" section to Accounts (9.5) with the same rows and the same states as 8.4, so a person can see and change everything later. Each row's action is the one from 8.4 ("Continue" if never asked, otherwise "Open Settings"; for Photos when limited, the two actions). Include the "Import from Files — no permission needed" row so the list is complete.

---

## 9. Screens outside the editor

The app is one navigation stack with no tab bar. Today every screen draws its own header row instead of using the system's bars. There are nine places a person can land:

| # | Screen | How it appears | How you leave |
|---|---|---|---|
| 1 | Launch (brand) screen | Over the app at every launch | Fades out by itself |
| 2 | Welcome / sign-in (three steps) | First launch: now inside the wizard (section 7). Later: a system sheet from Accounts or Post | Close, "Not now", swipe down, or a finished sign-in |
| 3 | Home — the project list | Root | — |
| 4 | Editor | Pushed when a project is tapped or created | Back button or a swipe from the left edge; leaving saves |
| 5 | Crop | A full screen over the editor | "Cancel" / "Done" |
| 6 | Export | A system sheet over the editor | Swipe down or "Done"; while rendering only "Cancel" |
| 7 | Post | Pushed from Export's "Post to…" or from Home's post button after picking a video | Back or swipe; while uploading, leaving asks first and the swipe is off |
| 8 | Accounts | Pushed from Home's account button, or from Post's "Connect" / "Reconnect" | Back or swipe |
| 9 | Return from a platform's sign-in | A blank moment that immediately becomes Accounts | — |

Plus four sheets (Aspect ratio, Quick edit, Project actions, YouTube options), and Apple's own surfaces: the photo picker, the Files picker, the share sheet, alerts and the rename prompt, the Apple sign-in sheet, an in-app browser sheet (Google sign-in, connecting a platform) and the permission alerts. There is no settings, help, legal or profile screen today.

### 9.0 Launch screen

**Today.** A full-screen navy gradient shown for at least 1.2 seconds while fonts load: the compass mark (96 pt) with a slowly swinging needle, the wordmark "CLIPY", the strapline "EDIT · SET SAIL · SHARE", and two bands of rolling waves at the bottom; it fades out over 0.3 s. With Reduce Motion the needle and waves stand still.

**Redesign direction.** Apple's launch guidance asks for a launch screen that looks almost identical to the first screen, with no text, logo or splash, matching light and dark. With SF Pro there are no fonts to wait for. Design the system launch screen as a plain version of Home's background, and decide whether any brand moment remains (if so: brief, never blocking, a still under Reduce Motion). List the choice as a departure.

### 9.1 Welcome / sign-in page (the stand-alone page, opened later as a sheet)

One page with three steps. As a sheet it has a Close button on step 1 and the system Back button on steps 2 and 3 (both inert while a request runs).

**Step 1 — choose.** Wordmark "Clipy"; tagline "Edit, caption and post your clips."; a fixed slot under it where an activity indicator shows while a sign-in runs. Then, full width:

1. Apple's own "Continue with Apple" button — the visual primary, so this step has no accent button. Hidden where Apple sign-in is unavailable (the slot keeps its height while the app is checking).
2. "Continue with Google" with Google's logo.
3. "Continue with email" → step 2.
4. Text button "Not now" (as a sheet) / "Continue without an account" (first launch).

Footer: "You only need an account to post. Editing works without one." While a sign-in runs every button is inert.

**Step 2 — email.** Title "Sign in with email". A text field, placeholder "you@example.com", email keyboard, focused automatically, return key "send". One message line under it (error or note). Primary button "Send code", disabled until the text looks like an address; while sending, an activity indicator stands exactly where the button was.

**Step 3 — code.** Line: "Enter the 6-digit code we sent to {email}" (or, when no server is set up: "Enter the 6-digit code from the email."). A field, placeholder "000000", number pad, spaced tabular digits, 6 characters, with the system's one-time-code autofill; the sixth digit signs in automatically. Message line. Primary "Sign in" (disabled until 6 digits; replaced by an indicator while working). Two text buttons: "Resend code" — shown as "Resend code in 59 s", counting down for 60 s after each code — and "Use a different email".

**Messages** (on step 1 near the buttons; on steps 2–3 under the field): "Sign-in isn't set up yet." · "Sign-in isn't set up yet, so no code was sent." · "We sent a new code." · "Couldn't sign in." · "That code didn't work. Check it or send a new one." · "Too many tries. Wait a minute, then try again." · "Couldn't reach Clipy. Check your connection." · "Clipy's server had a problem. Try again in a minute." · "Apple sign-in works in the installed app, not in Expo Go." · "Apple didn't return a sign-in token."

**States to design:** sheet vs wizard frame; busy; each message; the "not set up" walk-through mode (every step can be opened but only says sign-in isn't set up).

**Redesign direction.** Use the system sheet with a large detent and the standard Close / Back buttons. Give the email and code fields visible labels. Put messages next to the field or button they concern, not in a floating toast. "Apple sign-in works in the installed app, not in Expo Go." is developer wording: present it as the "update needed" state (14.3).

### 9.2 Home — the project list

**Today, top to bottom**

1. **Header:** the title "Your voyages"; on the trailing side two icon buttons — "Post a video" (opens the photo library to pick one video, then Post) and "Accounts".
2. **Project grid:** two columns of cards, scrolling vertically. The grid fades in once; cards only dip when pressed.
3. **Floating action row** above the Home indicator, over the cards: outlined "Quick edit" and the primary "New project" with a plus. While a Quick edit draft is being built both are replaced by one pill with an indicator and "Making your quick edit".

**Project card** (3:4 portrait): the cover picture, or "No preview" when there is none; top trailing a small pill with the length, for example "0:42"; if the project has a cover title, that text over the lower part of the picture (up to 2 lines); at the bottom, over a dark fade, the project name (1 line) and a second muted line (up to 2 lines): "Edited today" / "Yesterday" / "{n} days ago", or once posted "Posted · YouTube, TikTok". Tap opens the editor. Touch and hold (0.35 s, haptic) opens the project actions. **Damaged project:** a red border, "Damaged" instead of a picture, the name in red, no length pill; a tap opens the actions, which then offer only "Delete".

**States:** loading (an indicator near the top) · empty: 🏝️, title "No clips yet", hint "Pick some photos or videos from your library and start your first edit.", with the two action buttons still there · busy (a project is being created or copied): the header buttons and the grid ignore touches; New project shows nothing else today, Quick edit shows its pill.

**New project flow:** "New project" → system photo picker (photos and videos, up to 20) → **Aspect ratio sheet** → the project is created (named "Project 1", "Project 2", …) → the editor opens.

- *Aspect ratio sheet:* title "Aspect ratio"; nine choices in a 3 × 3 grid, each a small outlined rectangle of that shape over its label: "Auto" (dashed outline, preselected), "1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9". Note: "Auto fits your first photo or video. You can change it later." Primary "Create". Closing the sheet creates nothing.

**Quick edit flow:** "Quick edit" → **Quick edit sheet** → system photo picker (up to 30, in tap order) → the busy pill → the editor opens on a finished draft (clips cut to the music's beats, a filter, transitions, photo motion, a title text, music with a fade-out).

- *Quick edit sheet:* title "Quick edit"; six style tiles in two rows of three: "Travel" (preselected), "Party", "Calm", "Cinematic", "Retro", "Vlog". A note that changes with the selection: "Music: {track name}. Pick a style, then your photos and videos. You get a finished draft that you can change afterwards." (Travel "The Field of Dreams", Party "Party Sector", Calm "Bossa Nova", Cinematic "Piano", Retro "Funked Up", Vlog "Happy Adventure"). Primary "Choose photos and videos". These six are called "styles"; "Templates" is a different tool inside the editor — keep the two words apart.

**Project actions** (today a sheet titled with the project's name): "Rename" → the system text prompt "Rename project", pre-filled; "Duplicate"; red "Delete" → "Delete project?" / "This can't be undone." with "Cancel" and destructive "Delete".

**Messages:** "Clipy needs Photos access to import photos and videos. Open Settings to allow it." · "Couldn't create project" · "Couldn't make the quick edit" · "Couldn't import any of the selected items." · "{a} of {b} clips added; {n} couldn't be read" · "Couldn't rename project" · "Couldn't duplicate project" · "Couldn't delete project" · "Clipy needs Photos access to post a video. Open Settings to allow it." · "Couldn't open Photos." · "Couldn't read that video."

**Redesign direction — problems to solve**

- A system navigation bar with a large title that shrinks on scroll; content scrolls under glass with the scroll edge effect. "Your voyages" may stay or become "Projects" (a suggestion; Apple's writing guidance prefers names without "Your") — show your choice beside the current name.
- The touch-and-hold on a card is the only way to Rename / Duplicate / Delete and nothing shows it exists. Make it a real context menu and add a visible path to the same actions.
- Cards carry up to four pieces of text on a small picture (length, cover title, name, status). Decide what sits on the picture and what sits under it; text over a cover must stay legible on any image.
- Nothing shows that an ordinary New project is being created — touches are just ignored for seconds. Design one clear busy state for both flows (constraint 16).
- The primary action floats bottom-centre here but sits elsewhere on every other screen. Give primary actions one consistent home across the app.
- The empty state uses an emoji. Design a proper first-run empty state that leads straight to "New project" and "Quick edit" (this is where the wizard ends).
- There is no search, sort or multi-select on the list. You may propose them as clearly marked optional additions; do not make the design depend on them.
- New project is three steps (pick → ratio → create). Keep the steps; make their order and the "Auto" default feel effortless.
- "Post a video" as a bare paper-plane icon is not self-explanatory.

### 9.3 Export

A system sheet over the editor; the editor's video stays alive underneath. Title "Export". Today there is no close button.

| State | Content |
|---|---|
| **Options** (first shown) | "Resolution": "720p", "1080p" (default), "4K" — "4K" is disabled unless a clip is a 4K video, then a line reads "4K needs a 4K source clip." · "Frame rate": "24 fps", "30 fps", "60 fps" · "Quality": "High", "Smaller file" · "Estimated size: 123 MB" ("x.x GB" above a gigabyte), updating with every choice · primary "Export" with the brand mark as its icon. Frame rate and quality are remembered per project. |
| **Update needed** (the installed app cannot render) | The options stay, the primary button is gone, and a card reads: "Export needs the native build" / "Rendering the final video uses Clipy's Swift engine, which Expo Go can't load. Install a development build to export." / "Everything else in Clipy works in Expo Go." |
| **Exporting** | A 120-pt progress ring with the percentage inside, "Exporting…", "Cancel". The first part of the ring can be the app preparing changed sounds and background copies before the video itself renders (no separate wording today). The sheet cannot be swiped away. |
| **Done** | The ring full with a tick (success haptic), title "Ready to sail", a line such as "1080p · 0:42 · 48 MB", then: primary "Post to…" with "Save to Photos" as the second button (when posting is set up) — or primary "Save to Photos" (when it is not); "Share" (system share sheet); text button "Done". |
| **Error** | A card with an error symbol and the message, then primary "Try again". Messages: "Add at least one clip first." · "Not enough free space on this iPhone for the export." · otherwise the video engine's own sentence. |

**Messages:** "Saved to Photos" · "Allow Photos access in Settings to save." · "Could not save to Photos." · "Could not share the video."

**Redesign direction.** Add the standard Close button and a thumbnail (or short preview) of what will be exported. Use native controls for the three option groups. Keep one indicator style from start to finish (Apple: never switch between bar and ring) and say what is happening in each phase ("Preparing", "Exporting"). Cancelling loses the render, so confirm it. Rewrite the "update needed" card in plain words (14.3). "Ready to sail" is brand voice — keep or replace according to your brand decision in section 2. This is the natural place to offer the optional notification and Live Activity (3.12, 8.3).

### 9.4 Post

Purpose: send one finished video to several platforms at once, with one caption.

**Today, top to bottom**

1. Header: Back and the title "Post".
2. Scrolling content:
   - A muted line with the video's facts: "0:42 · 48 MB". (No thumbnail or preview today.)
   - An indicator while the session is read.
   - The **sign-in card** when signed out (below); when signed in:
   - **Caption field:** multi-line, placeholder "Write a caption…". Under it, trailing, a counter "{length} / {limit}" where the limit is the smallest among the ticked platforms (red when over); just "{length}" when no ticked platform takes the caption. Then one muted line per ticked platform that ignores the caption: "TikTok doesn't receive this caption — you'll write it in TikTok."
   - **Platform list:** five rows in this order — YouTube, TikTok, Instagram, Facebook, X. While the list loads: an indicator. If it fails: the message (default "Something went wrong.") and "Try again".
3. Pinned at the bottom: primary "Post" (signed in only; disabled when nothing can be sent or while posting) and "Share…" (system share sheet; always available, also when signed out).

**A platform row.** Leading, one tappable area acting as a checkbox: the tick box (ticked / can be ticked / cannot), the platform's logo, the platform name and, when connected, the account name. Connected platforms start ticked. Trailing, exactly one of:

- "Options" (YouTube only) → the options sheet
- "Not available yet" (nothing to press)
- "Not connected" over "Connect" (opens Accounts)
- red "Sign-in expired" over "Reconnect" (opens Accounts; on return the row offers "Resume" if it had failed)
- while posting: "Preparing…", then "42%" with a thin progress bar under the row, then "Publishing…"
- when done: "Done" and, if there is a link, "View" (opens the post); the tick box becomes a static done mark
- when failed: "Retry" or "Resume" (or "Reconnect")

Each platform runs on its own; one failing does not stop the others. A success gives a success haptic.

**Small lines under a row**

| Kind | Exact texts |
|---|---|
| Standing notes while ticked | YouTube: "YouTube keeps uploads from new apps private until Google reviews Clipy. Open the video in YouTube to make it public." (+ " Longer than 3 minutes, so it posts as a regular video, not a Short.") · TikTok: "Clipy sends the video to your TikTok inbox. Open TikTok to add the caption and post it (up to 5 unfinished drafts a day)." · Instagram: "Posts as a Reel. Instagram can take a few minutes to process — keep this screen open." · Facebook: "Posts as a Reel on your Page. Until Clipy's Facebook app is switched to Live, the Reel may be visible only to you." · X: "Posting to X costs about 1.5¢ (about 20¢ if the caption has a link). The video goes through Clipy's server in small pieces." and, when the caption has a link, "This caption contains a link — X charges about 20¢ for posts with links." |
| Validation (the row then cannot be sent) | "Add a caption or a title for YouTube." · "YouTube titles can be up to 100 characters." · "YouTube descriptions can be up to 5000 characters." · "TikTok accepts videos up to 10 minutes." · "TikTok accepts videos up to 4 GB." · "TikTok accepts MP4, MOV or WebM videos." · "Instagram Reels must be at least 3 seconds." · "Instagram Reels can be up to 15 minutes." · "Instagram accepts videos up to 300 MB." · "Instagram captions can be up to 2200 characters." · "Facebook Reels must be at least 3 seconds." · "Facebook Reels can be up to 90 seconds." · "Facebook accepts videos up to 1 GB." · "X posts can be up to 280 characters (emoji and links count extra)." · "X accepts videos up to 20 minutes." · "X uploads go through Clipy's server and are limited to 1 GB." · "Captions can be up to {n} characters." |
| Failure | "Something went wrong." · "Reconnect {platform} in Accounts." · "The connection dropped. Check your internet, then resume." · "Upload cancelled." · "Couldn't read the video file." · "The video file is empty." · "The upload session expired. Post again." · "The connection dropped. Post again to restart the upload." · "TikTok may already have this video — check your TikTok inbox before posting again." · "Clipy's server is asleep or unreachable. Open the Supabase dashboard to wake it, then try again." · "Posting isn't set up yet." · "Sign in to Clipy first." |
| Done without a link (TikTok) | "Sent to TikTok — open TikTok to finish posting." |

**YouTube options sheet** (lifts above the keyboard): title "YouTube options"; "Title" with a field (placeholder "Uses your caption", 100 characters) and a counter "12 / 100"; "Who can see it" with three choices "Public" (default), "Unlisted", "Private". Changes apply at once; there is no Save button.

**Sign-in card** (also on Accounts). Signed out: "Sign in to Clipy" / "Clipy keeps your connected accounts safe on its server." / primary "Sign in" → the sign-in sheet. No server set up: "Sign-in isn't set up yet" / "Clipy's server hasn't been connected, so signing in and posting don't work yet. You can still share with the Share button." / "Sign in" (opens the sheet as a walk-through).

**Leaving while uploads run:** "Stop posting?" / "Uploads in progress will be cancelled." with "Keep posting" and destructive "Stop".

**Broken link state** (opened with a video it cannot read): only Back and an empty state — 🎞️, "This video can't be posted.", "Clipy couldn't read this video file. Go back and pick it again."

**Messages:** "Could not share the video." · "Couldn't open the link."

**Redesign direction — problems to solve**

- With five platforms ticked the list is mostly small print: up to three stacked notes per row, several two sentences long. Find a calmer way to give each platform its rule, its price and its problem without losing any of the texts (for example progressive disclosure, an info control per row, one summary line).
- Show the video (thumbnail, length, size) so the person knows what is being sent.
- Per-platform progress must be readable at a glance and each failure must sit with its own "Retry" / "Resume" / "Reconnect".
- Developer wording reaches users: "Open the Supabase dashboard to wake it…", "Until Clipy's Facebook app is switched to Live…". Offer plainer versions beside the originals.
- The caption counter's meaning ("smallest limit among ticked platforms") is not explained.
- The row is a checkbox today: keep the checkbox behaviour and its VoiceOver role.

### 9.5 Accounts

Purpose: sign in to or out of Clipy and connect the five platforms.

**Today.** Header: Back and "Accounts". Content: an indicator while the session is read; the sign-in card (as on Post) when signed out or when no server is set up; when signed in, five platform rows (indicator while loading; on failure the message and "Try again"). Signed in only, under the list: "Signed in as {email}" (or "Signed in") and a text button "Sign out". Always, at the very bottom, one small line naming the installed build: "App build: stabilize and smooth" / "App build: beats and background" / "App build: noise, ramps and speech" / "App build: sound tools" / "App build: export only (older)" / "Expo Go (no video engine)".

**A platform row:** the platform's logo (muted when unavailable); the account's round picture when connected; the platform name with the account name under it, and a detail line when needed — "Not available yet" or red "Sign-in expired". Trailing, one action: "Connect" / "Reconnect" / red "Disconnect" / an indicator while working / nothing when unavailable. This screen deliberately has no primary button.

- "Connect" / "Reconnect" open the platform's own sign-in page in an in-app browser sheet.
- "Disconnect" → "Disconnect {platform}?" / "Clipy will stop posting to this account." with "Cancel" and destructive "Disconnect".
- "Sign out" → "Sign out of Clipy?" / "Your connected accounts stay connected." with "Cancel" and destructive "Sign out".

**Messages:** "Signed out." · "Couldn't sign out." · "Couldn't connect." · "Something went wrong." (or the server's own sentence).

**Redesign direction.** Use a system grouped list with sections: the Clipy account; connected platforms; **Permissions** (8.5, new); About (the build line, rewritten in plain words — "Expo Go (no video engine)" is developer wording). When signed out the page is one card on an empty screen, and when signed in with nothing connected nothing explains what connecting does: design both. "Sign out" is destructive but is drawn as a plain accent text button today: give all destructive actions one form. This screen is the nearest thing the app has to Settings; you may suggest the title "Settings" beside the current "Accounts". There is no help, privacy or legal page: leave clearly marked empty slots for links the owner can supply — do not write legal text.

### 9.6 Return from a platform's sign-in

A blank screen with no animation that immediately becomes Accounts. Design nothing new; make sure Accounts shows the fresh connection state (the row's indicator, then the connected account) the moment it appears.

### 9.7 Shared pop-ups outside the editor

- **Bottom sheet** (today the app's own: dimmed screen, grabber, title row, optional text button): replace with the system sheet and detents. Used for Aspect ratio, Quick edit, Project actions (which may become a context menu) and YouTube options.
- **Toast** — see 14.4.
- **Alerts and the rename prompt** are system alerts; follow Apple's rules for titles and buttons (3.8).

---

## 10. The editor

### 10.1 Reaching and leaving

- One pushed screen per project. Back button, or a swipe from the **left edge only** (so it does not fight the timeline, the preview gestures and the sliders).
- **No Save button and no "saved" indicator.** Every change is written automatically half a second after the last edit, and leaving flushes everything. Leaving is always safe and asks nothing.
- **Undo history:** up to 50 steps, kept only while the editor is open. Zoom level, selection and the open tool reset on every opening.
- **Loading:** a bare indicator on the page, with no header and no Back button.
- **Cannot open:** the title "Can't open project" and one muted line with the system's raw error; no button — only the back swipe.
- **Missing media:** the editor still opens; the item shows a red warning badge on the timeline and playback skips a missing main clip. No message.
- **Export** in the header closes any open tool, pauses, and opens the Export sheet (9.3).

### 10.2 Layout today, top to bottom (one column, no scrolling)

Status bar → header (48 pt) → preview (all the space left) → transport row (48 pt) → timeline (120 pt or more) → bottom area (90 pt plus the Home indicator inset).

**Header.** Back · the project name in the middle (one line, truncated; tapping it opens the system prompt "Rename project", pre-filled; an empty answer changes nothing; renaming can be undone; nothing shows that it is tappable) · the primary pill "Export" (never disabled, even with an empty project; while a voice-over is being recorded it only pauses playback).

**Transport row,** edge to edge: Undo (dimmed when there is nothing to undo) · the time readout "0:07 / 0:32" (whole seconds, tabular digits) · Play / Pause (a filled disc; dimmed in an empty project; from the end it restarts at 0:00) · the **ratio pill** showing "Auto" or the ratio such as "9:16" (opens the Aspect ratio strip) · Redo. There is nothing else here: no full screen, mute, zoom or jump-to-start.

### 10.3 The preview

The **frame** is the largest rectangle of the project's shape that fits the slot, centred. Nine shapes: Auto (the first clip's shape), 1:1, 3:2, 2:3, 16:9, 9:16, 4:3, 3:4, 21:9. Inside the frame, from back to front:

1. The main clip's background (a colour, black, or a blurred still) and its picture — cropped, placed, rotated, flipped, optionally rounded by a mask and faded by opacity.
2. Filter and Adjust tints that approximate the export.
3. The transition "curtain": a fade to black or white, or a black shape standing in for the other clip. The preview shows one clip at a time.
4. Layers (picture-in-picture videos and photos), later ones on top.
5. Timeline-effect overlays (colour flashes, light leaks, flare bands, vignette strips, scratch lines; shake and zoom move the picture).
6. **Blur / mosaic boxes** active at the playhead, drawn today as a dark see-through rectangle with a thin border (mosaic adds a coarse checker). The selected one has an accent border and two corner handles (top-left and bottom-right): drag the box to move it, pinch to scale, drag a corner to resize. A box is selected from the timeline, not by tapping it.
7. **The selected clip's or layer's frame:** a plain 1-pt accent rectangle, rotated with the picture, **with no handles or buttons**. While it shows, the whole frame accepts drag (move), pinch (scale) and two-finger twist (rotate), together. Magnets with a haptic: centred horizontally and vertically, right angles, and the Fill and Fit sizes. No guide lines are drawn. One gesture is one undo step.
8. **Texts, captions and stickers.** Tap one to select it. The selection frame is a dashed accent rectangle with four corner dots (decoration, not handles). Drag, pinch and twist move, scale and rotate it (rotation snaps near quarter turns); **double-tap** opens the "Text" panel for a text or caption and the "Sticker" editor for a sticker.
9. **The "Preview" tag:** a small pill at the top leading corner reading "Preview". It shows whenever the frame only approximates the export (a filter, an adjustment, a transition, a reversed clip, a speed curve, any effect, a blend mode, green screen, a blurred background, or a background copy that is not shown yet). It cannot be tapped and explains nothing.
10. The paused play glyph in the centre (not a button).

**Taps on the frame**, in this order: a tap on a layer's picture selects that layer; with a layer selected, a tap elsewhere deselects it; otherwise a selected text or sticker is deselected; otherwise a selected effect; otherwise a selected sound; otherwise it plays or pauses. A selected main clip is not deselected by a tap. In an empty project the frame is a flat dark rectangle and taps do nothing.

### 10.4 The timeline

- **Height** = the clip area (120 pt) + 32 pt for every row below it. It is never capped and never scrolls vertically: every extra row makes the preview smaller.
- **Playhead:** fixed at the horizontal centre; the content scrolls under it. No handle and no time bubble.
- **Scrolling and zoom:** dragging sideways scrubs (and pauses playback), with momentum; during playback the timeline follows. Pinch zooms between 20 and 200 points per second (default 60). There is no time ruler, no tick marks, no zoom buttons and no scroll indicator.
- **Main clips** sit side by side in one row, filled with thumbnails. Width = duration × zoom.
  - Badges inside a clip, bottom leading: the speed ("2×", "0.5×", or a curve name: "Montage", "Hero", "Bullet", "Jump cut", "Flash in", "Flash out"); "◀" when reversed; a small picture glyph for a photo; a lower-case "f" when a filter is set.
  - Missing file: a red warning disc at the top leading corner.
  - Tap selects the clip and moves the playhead to its start; tapping the selected clip deselects it.
  - **Selected clip:** an accent border; **trim handles** on both edges (a photo has only the trailing one, which sets its length from 0.5 to 60 s) — trimming steps in 0.1 s, moves everything after it, and snaps to the playhead and to beat markers; a small **reorder handle** at the bottom centre ("Move clip": touch and hold a quarter of a second, then drag sideways — today only the little handle follows the finger, the clips do not move and there is no drop marker); **keyframe diamonds** along the top (tap one to jump to it).
- **Transition marker:** a small diamond on the cut between two clips, drawn only when that cut already has a transition; tapping it selects the clip before the cut and opens the "Transition" strip. A cut without a transition shows nothing.
- **Add-clip tile:** a square tile with a plus after the last clip ("Add clips"); opens the photo picker; shows an indicator and is inert while importing.
- **Beat ticks:** small ticks along the top of the clip area at every beat marker. Not tappable.
- **Rows below the clips** exist only while they hold something, in this fixed order: Music, Voice, Sound effects (one row each), Layers (one row **per layer**), Text / captions / stickers (as many rows as needed so bars never overlap), Effects (one row). Rows have no labels or icons; colour is the only cue.

| Row | Bar colour today | The bar shows | Notes |
|---|---|---|---|
| Music | blue | a speaker glyph, the volume as "100%", the track title | No waveform. A bar overlapping an earlier one is slightly see-through. Contents are hidden when the bar is very short. Missing file: a small red warning disc |
| Voice | teal | same | same |
| Sound effect | orange | same | same |
| Layer | grey-blue | a video or photo glyph and the word "Layer" (every layer says just "Layer") | One row per layer; a photo layer has only the trailing handle |
| Text / caption | gold | the text itself, one line | Keyframe diamonds when selected. Captions look identical to texts |
| Sticker | pink | the emoji, or the shape's name ("Circle", "Star", …) | Same row and behaviour as text |
| Effect | violet | the effect's name | Drawn only up to the project's end |

  All bars work the same way: tap selects (a second tap deselects, except for texts), touch and hold then drag moves the bar in time, and a selected bar shows a handle on each end to trim it. The selected border is cream today, not the accent used for main clips. Every drag is one undo step.

- **Snapping:** while a bar is moved or trimmed, its edges snap to 0:00, the project's end, the playhead, every clip boundary, the edges of every other bar, and beat markers. Entering a snap gives a haptic and shows the **snap guide** — a thin vertical line across the whole timeline at that time.
- **Progress of background copies:** today nothing on the timeline shows that a clip's copy (cut-out, stabilize, smooth slow motion, changed sound) is being prepared. Design a per-clip and per-bar progress and "ready" cue (section 14.1).

### 10.5 Layout states

| State | What happens |
|---|---|
| Toolbar showing (default) | The bottom area is the toolbar. |
| **A strip is open** | The toolbar's buttons disappear and the strip takes their place. It grows upward over the timeline's lowest rows by at most two rows, never over the clip row; whatever is left is taken from the preview. Preview and timeline stay live. |
| **A panel is open** | The timeline is hidden and the panel takes the place of timeline + toolbar. Preview and transport row stay. Regular height = 46 % of the screen height (between 300 and 430 pt); compact = 240 pt. |
| **Keyboard up** | A panel shrinks to its typing height (22 % of the screen, 148–200 pt) on top of the keyboard and hides its tab row and pinned area. A strip with the keyboard up (Trim) also hides the timeline. Dragging a panel's body puts the keyboard away. |
| **Multi-select** | The toolbar is replaced by the multi-select bar (11.11). |
| While a voice-over is recorded | No tool can be opened or closed. |

Opening fades and slides in the *content* only; the container appears at once. Closing is instant.

**A strip today:** a header (the title; an optional small note of one or two lines; an optional text action such as "Apply to all"; the round Done tick) and a body of fixed height holding a **tile row** (scrolls sideways; may have a fixed lead on its leading side holding tabs or a switch; opens scrolled to the selected tile) above a **slider row** ("name value" on the leading side, the slider filling the rest, an optional trailing control). There is no Cancel: changes apply live and are undone with Undo.

**A panel today:** a header (title, optional text action, Done tick), an optional tab row, an optional pinned area that stays above the scrolling body, then the body.

### 10.6 Redesign direction for the editor — problems to solve

- **The toolbar is very long.** A clip's bar holds up to 28 equal-weight buttons in one sideways-scrolling row (about five and a half screens on a mid-size phone), a layer's up to 26. There is no grouping, no sign that more exist, no edge fade; "Delete" is at the far end; frequent and rare tools are mixed. Solve discoverability and reach **without removing a tool** and without showing tools that cannot apply. (Apple: group by function and frequency; a More menu for the rare ones.)
- **The navigation model is hidden.** "Audio" and "Text" on the main bar swap the bar's contents instead of opening something; "Edit" only selects a clip. The same labels recur on different bars with different icons ("Edit", "Volume", "Split", "Duplicate", "Delete").
- **Button label and tool title disagree:** "Cut out" opens "Remove background"; "Sound" opens "Sound quality"; "Beats" opens "Beat markers"; "Ratio" opens "Aspect ratio"; "Animate" opens "Animation"; "Stickers" opens "Sticker", and the sticker picker and the sticker editor share the title "Sticker". Suggest one name per tool, shown beside the current names.
- **Timeline rows shrink the preview without limit.** Each layer, each kind of sound and each overlapping text adds a row; a four-cell collage alone adds four. Find a way to keep the preview large (collapsing, grouping, a capped height with its own scroll — your proposal) while every bar stays reachable.
- **No time ruler, no zoom control, no waveforms** on sound bars, no row labels or icons; every layer reads "Layer"; captions and texts look the same; kinds are told apart by colour alone.
- **Two selection colours** (accent for clips, cream for bars), and the text bar's colour equals the accent.
- **Tiny targets:** the transition diamond (12 pt), keyframe dots (8 pt), the reorder handle (28 × 20 pt), bar handles (12 pt wide on 28-pt bars), clip badges and the "Preview" tag at 10 pt, toolbar labels at 11 pt, colour swatches at 28 pt, the Done tick at 32 pt.
- **A cut without a transition shows nothing to tap.** Adding a transition is reachable only from the clip's toolbar.
- **Reordering gives almost no feedback.**
- **The selected clip in the preview has no handles** and its gestures and magnets are undiscoverable; the dots on a text's frame look like handles but are not. Make direct manipulation visible (handles, guide lines when a magnet engages) without blur or shadow over the video.
- **Clip badges are cryptic** ("f", "◀").
- **The "Preview" tag** never says why and cannot be tapped.
- **Empty project:** a dark empty frame, a lone plus, three tools and an enabled "Export". Design a guiding empty state.
- **Loading and error states are bare,** and the error shows a raw system message with no button.
- **No save feedback**, no confirmation on any Delete (Undo is the safety net — keep that, but make Undo's effect visible); rename is an unmarked tap on the title.
- **Undo and Redo sit at opposite ends** of the transport row and say nothing about what was undone. (Apple: standard undo / redo symbols in a toolbar; after an undo, bring what changed into view. The system's own undo gestures — shake, three-finger swipe — should work too.)
- **Silent refusals:** Split at a clip's edge, Forward / Back at the end of the stack, duplicating a text that is refused, a crop shape that does not fit, Export during a recording. Per Apple, say why a command cannot run.
- **Strip headers are crowded:** title + a one- or two-line note + a text action + Done share one row. Notes and long status sentences need a proper place.
- **Every strip has the same height even when it holds one row** (Mask, Blend, Transform, Ratio, Background, Effects, Opacity, Strength), leaving empty space; consider a small set of fixed heights.
- **Panels cannot be dragged or swiped closed;** the Done tick is the only way.
- **Filled and outline icons are mixed.**

---

## 11. The bottom toolbar — every selection context

There is one bar; its contents follow what is selected. On every bar except the main one a Back control ("Back to main tools") is pinned at the leading side, outside the scrolling row; it clears the selection and returns to the main bar. A toggle that is on shows an "active" look. Tools that cannot apply are left out; a brief dimming happens only while a file is being checked or a picker is busy. Suggested SF Symbols for every label are in section 6. There are **11 contexts and 50 distinct tools**.

### 11.1 Nothing selected — the main bar (no Back control)

| # | Label | What a tap does | Shown when |
|---|---|---|---|
| 1 | "Edit" | Selects the main clip under the playhead (the clip bar then shows). Opens nothing | the project has clips |
| 2 | "Audio" | Switches to the audio section bar (11.2) | always |
| 3 | "Text" | Switches to the text section bar (11.3) | has clips |
| 4 | "Stickers" | Opens the "Sticker" picker panel | has clips |
| 5 | "Overlay" | Opens the photo picker for one item; it becomes a layer at the playhead and is selected. Dimmed while a picker is busy. Messages: "You've reached the layer limit." / "That video is too short." / "Only two video layers can play at the same time." / "Couldn't add that item." | has clips |
| 6 | "Collage" | Opens the "Collage" panel. Dimmed while a picker is busy | has clips |
| 7 | "Effects" | Opens the "Effects" strip | always |
| 8 | "Filter" | Selects the clip under the playhead, then opens "Filter" | has clips |
| 9 | "Adjust" | Selects the clip under the playhead, then opens "Adjust" | has clips |
| 10 | "Ratio" | Opens the "Aspect ratio" strip (same as the ratio pill) | always |
| 11 | "Background" | Selects the clip under the playhead, then opens "Background" | has clips |
| 12 | "Cover" | Opens the "Cover" panel | has clips |
| 13 | "Templates" | Opens the "Templates" panel | has clips |

An **empty project** shows only "Audio", "Effects" and "Ratio". Because Filter, Adjust and Background select a clip first, closing their strip lands on the clip bar.

### 11.2 Audio section (after "Audio", nothing selected)

| # | Label | What a tap does | Shown when |
|---|---|---|---|
| 1 | "Add audio" | Opens the "Add audio" panel | always |
| 2 | "Ducking" | A toggle (haptic): music dips to 30 % while a voice-over plays. Active look while on. Opens nothing and explains nothing today | always |
| 3 | "Beats" | Opens the "Beat markers" panel | has clips |

### 11.3 Text section (after "Text", nothing selected)

| # | Label | What a tap does |
|---|---|---|
| 1 | "Add text" | Adds a new text at the playhead (3 seconds long, centred, the words "Your text"), selects it and opens the "Text" panel with the keyboard up. A text left empty when the panel closes is removed |
| 2 | "Captions" | Opens the "Captions" panel |

Both section bars fall back to the main bar on any selection change, and when the last clip is removed.

### 11.4 A main clip selected

| # | Label | What a tap does | Shown / dimmed |
|---|---|---|---|
| 1 | "Split" | Cuts the clip under the playhead in two (haptic). Silent if it cannot cut there | always |
| 2 | "Trim" | Opens the "Trim" strip | always |
| 3 | "Select" | Enters multi-select with this clip chosen (haptic) | 2 or more clips |
| 4 | "Speed" | Opens the "Speed" strip | videos |
| 5 | "Volume" | Opens the "Volume" strip | videos that are not reversed |
| 6 | "Extract audio" | Moves the clip's sound to its own bar on the Voice row (titled "Clip sound"), mutes the clip and selects that bar. Dimmed briefly while the file is checked. Messages: "This clip has no sound to extract." / "Set the speed of this clip back to 1x first. Extracted sound plays at normal speed." / "You have reached the audio track limit." / "This clip has no sound." / "The sound of this clip is already on the audio row." / "The sound of this clip is now its own bar." | videos, not reversed |
| 7 | "Voice" | Extracts the sound first if needed (message "The sound of this clip is now its own bar."), selects that bar and opens the "Voice" panel. If the installed app lacks the sound tools: the update-needed message and nothing else | videos, not reversed |
| 8 | "Sound" | The same, opening "Sound quality" | videos, not reversed |
| 9 | "Animate" | Opens the clip "Animation" strip | always |
| 10 | "Motion" | Opens the "Motion" strip | photos without keyframes that are not collage cells |
| 11 | "Filter" | Opens "Filter" | always |
| 12 | "Adjust" | Opens "Adjust" | always |
| 13 | "Background" | Opens "Background" | always |
| 14 | "Templates" | Opens "Templates" | always |
| 15 | "Crop" | Opens the full-screen Crop | always |
| 16 | "Transform" | Opens "Transform" | always |
| 17 | "Opacity" | Opens "Opacity" | always |
| 18 | "Mask" | Opens "Mask" | always |
| 19 | "Green screen" | Opens "Green screen" | always |
| 20 | "Cut out" | Opens the "Remove background" strip | hidden for a reversed clip |
| 21 | "Stabilize" | Opens the "Stabilize" strip | videos; hidden for a reversed clip |
| 22 | "Keyframe" | Adds a keyframe at the playhead, or removes the one there (haptic). The symbol is filled and the button active when the playhead sits on a keyframe | hidden while a photo's Motion is on; dimmed while the playhead is not on this clip |
| 23 | "Transition" | Opens the "Transition" strip for the cut after this clip | hidden for the last clip |
| 24 | "Replace" | Opens the picker for one item and swaps the clip's media. Dimmed while a picker is busy. Messages: "That video is too short." / "Couldn't replace the clip." | always |
| 25 | "Reverse" | Toggle (haptic); active look while reversed | videos; hidden while Remove background, Stabilize or Smooth slow motion is on for the clip |
| 26 | "Freeze" | Inserts a 2-second still of the frame at the playhead between the two halves of the clip and selects it. Dimmed while capturing (no other progress sign today). Messages: "Move the playhead onto the clip first." / "Move the playhead away from the clip's edge." / "Couldn't capture that frame" | videos |
| 27 | "Duplicate" | Copies the clip | always |
| 28 | "Delete" | Deletes at once (stronger haptic). No confirmation; Undo restores | always |

A reversed clip therefore loses Volume, Extract audio, Voice, Sound, Cut out and Stabilize. A photo loses Speed, the four sound tools, Stabilize, Reverse and Freeze, and may gain Motion.

### 11.5 A layer (picture-in-picture) selected

In order: "Collage" (only when the layer is a collage cell; opens the "Collage" panel on that collage), "Trim", "Speed" (videos), "Volume", "Extract audio", "Voice", "Sound" (videos that are not reversed), "Animate", "Motion" (photos, as above), "Filter", "Adjust", "Crop", "Transform", "Opacity", "Mask", "Blend" (opens the "Blend" strip; layers only), "Green screen", "Cut out" (not when reversed), "Stabilize" (videos, not reversed), "Keyframe", "Forward" and "Back" (move the layer one step up / down the stack, haptic; nothing happens at either end and the buttons are never dimmed), "Replace", "Reverse", "Duplicate", "Delete". Actions and conditions are those of 11.4.

Differences from a main clip: no Split, Select, Background, Templates, Transition or Freeze; adds Collage, Blend, Forward, Back. Extra messages: Duplicate may answer "You've reached the layer limit." / "Only two video layers can play at the same time." / "There's no room after this layer."; Replace may also answer "Only two video layers can play at the same time."; dragging or trimming a layer's bar into a third simultaneous video stops the bar and, on release, shows "Only two video layers can play at the same time."

### 11.6 A text selected

"Edit" (opens the "Text" panel — the same as double-tapping the text in the preview) · "Animate" (opens the text "Animation" strip) · "Keyframe" (adds / removes at the playhead; dimmed while the playhead is outside the text's time) · "Duplicate" (copies and selects the copy; silent if refused) · "Delete" (at once) · "Add text" (adds another text and opens the "Text" panel on it).

### 11.7 A caption selected

"Edit" (opens "Text") · "Captions" (opens "Captions") · "Duplicate" · "Delete" · "Add text". No Animate and no Keyframe.

### 11.8 A sticker selected

"Edit" (opens the compact "Sticker" editor panel) · "Animate" · "Keyframe" · "Duplicate" · "Delete". No "Add text".

### 11.9 A sound bar selected (music, voice or sound effect)

| # | Label | What a tap does | Dimmed / hidden |
|---|---|---|---|
| 1 | "Split" | Cuts the sound at the playhead and selects the second piece (haptic). At the limit: "You've reached the audio track limit." | dimmed while the playhead cannot cut it |
| 2 | "Volume" | Opens the sound "Volume" strip | |
| 3 | "Fade" | Opens the "Fade" strip | |
| 4 | "Voice" | Opens the "Voice" panel, or shows the update-needed message | |
| 5 | "Sound" | Opens "Sound quality", or shows the update-needed message | |
| 6 | "Duplicate" | Copies and selects the copy (haptic). At the limit of 12 tracks: "You've reached the audio track limit." | |
| 7 | "Delete" | Deletes at once (stronger haptic) | |
| 8 | "Add audio" | Opens "Add audio" | |
| 9 | "Ducking" | The project-wide toggle, active look while on | |
| 10 | "Beats" | Opens "Beat markers" | hidden without clips |

### 11.10 A timeline effect selected

"Strength" (opens the "Strength" strip) · "Duplicate" (copies and selects the copy) · "Delete" (stronger haptic). A blur / mosaic box is also moved and resized directly in the preview.

### 11.11 Multi-select (main clips only)

Entered with "Select" on a clip's bar. Tapping a clip toggles it instead of selecting and seeking; chosen clips get the selection border; trim handles, the reorder handle and keyframe dots are hidden. The toolbar is replaced by the **multi-select bar**: a centred line "N selected" (for example "3 selected"; "0 selected" is possible) over one row of tools:

| Label | What it does | Disabled when |
|---|---|---|
| "Delete" | Deletes all chosen clips in one step (stronger haptic); ends the mode | none chosen |
| "Duplicate" | Duplicates them (haptic); the originals stay chosen | none chosen |
| "Filter" | Opens the Filter strip titled "Filter · 3 clips" (or "· 1 clip") | none chosen |
| "Speed" | Opens the Speed strip for all chosen clips ("Speed · 3 clips") | no video among them |
| "Volume" | Opens the Volume strip titled "Volume · 2 clips" | no un-reversed video among them |
| "Select all" | Chooses every main clip | never |
| "Done" | Leaves the mode | never |

Selecting anything else, tapping the ratio pill or a transition marker also leaves the mode.

**Accessibility labels in use (keep or improve):** "Back", "Undo", "Redo", "Play", "Pause", "Aspect ratio", "Preview" (hint "Tap to play or pause"), "Add clips", "Move clip", "Trim start handle", "Trim end handle", "Keyframe", "Back to main tools", "Done", "Crop box", "Blur box", "Mosaic box", "Photo layer", "Video layer", "Rename project" (hint on the project name).

---

## 12. Strips — the short inline tools (22)

Shared behaviour: every slider applies live while dragged and one drag is one undo step; every tile or chip pick applies at once as one undo step; a strip closes with its Done control and changes are undone with Undo (there is no Cancel). "Rest tick" means the slider gives a haptic tick when the thumb crosses that value. Values below are written in the app's current formats — unify the formats (5.4) and show the result.

### 12.1 Simple strips

| Tool (button → strip title) | Where it appears | Controls | States and messages |
|---|---|---|---|
| **Trim** → "Trim" | Clip, layer | Video: two number fields (start and end, seconds with one decimal, decimal keypad) and a compact primary "Apply". Photo: one field (length) and "Apply". The fields have no visible labels today (VoiceOver: "Trim start", "Trim end", "Length"). The keyboard comes up and the strip sits on it | Note, video: "Seconds into the original clip (0 – 12.3)" (the second number is the source's length). Note, photo: "How long the photo stays on screen (0.5 – 60 s)". Nothing changes until "Apply", which also closes the strip. Fields refresh if the clip is trimmed by its handles or by Undo meanwhile. Messages (layers): "That trim is too short or outside the clip." / "That trim doesn't fit — only two video layers can play at the same time." |
| **Volume** → "Volume" (multi-select "Volume · 3 clips") | Clip, layer, multi-select — videos playing forwards | Row 1: value only ("100%"), slider 0–200 %, step 5 %, rest tick at 100 %; trailing "Mute" with a switch. Row 2: "Fade in" "0.0 s", 0 to half the clip's length (5 s at most), step 0.05 s. Row 3: "Fade out", same | Note: "Above 100% only applies in the exported video." Rows 2 and 3 are absent in multi-select |
| **Filter** → "Filter" (multi-select "Filter · 3 clips") | Main bar (clip under the playhead), clip, layer, multi-select | Picture tiles, each showing the clip's own first frame with that filter roughly applied and its name: "None", "Warm", "Cool", "Vivid", "Faded", "Mono", "Noir", "Vintage", "Sunset", "Golden", "Teal", "Pastel", "Film", "Chrome", "Instant", "Process", "Tonal", "Sepia", "Crisp", "Dream", "Amber", "Jade", "Matte", "Bleach", "Dusk", "Moody", "Cinema", "Blush", "Grit", "Silver", "Indigo", "Drama" (32). Slider "Strength" "100" (0–100, step 1, default 100) | Header action "Apply to all clips" (not for a layer or in multi-select). The slider is disabled while "None" is selected. A tile is a plain coloured box until its thumbnail loads |
| **Adjust** → "Adjust" | Main bar, clip, layer | Twelve chips choosing which value the slider edits: "Brightness", "Contrast", "Saturation", "Exposure", "Warmth", "Tint", "Highlights", "Shadows", "Sharpen", "Vignette", "Fade", "Grain". Slider: the chosen name + value. The first eight run −100 to +100 (shown "+25", "-10", "0"; rest tick at 0); the last four run 0 to 100. Step 1. Trailing: quiet button "Reset" (resets all twelve) | Header action "Apply to all" (not for a layer). A changed value gets a dot after its name ("Contrast •"). Opens on Brightness every time. "Reset" is disabled when nothing is changed |
| **Effects** → "Effects" | Main bar only (also in an empty project) | Twenty action tiles: "Glitch", "Shake", "Zoom pulse", "Blur", "VHS", "Light leak", "Flash", "RGB split", "Old film", "Glow", "Blur box", "Mosaic box", "Film burn", "Lens flare", "Dust", "Heartbeat", "Hue shift", "Mirror", "Soft edges", "Strobe". A tap adds that effect at the playhead (2 s long, strength 70), selects it on the timeline and closes the strip | "Blur box" and "Mosaic box" also put a draggable, resizable rectangle on the preview. Messages (after the strip closes): "Add a clip first." / "No room for an effect here." |
| **Strength** → "Strength" | A selected effect | One slider: "Strength" "70" (0–100, step 1) | — |
| **Transition** → "Transition" | Clip (when another clip follows); also by tapping a transition marker | Twenty-one choices (text chips today, no pictures): "None", "Fade", "Dissolve", "Slide left", "Zoom", "Slide right", "Slide up", "Slide down", "Wipe", "Spin", "Blur", "Cover left", "Reveal left", "Cover up", "Reveal down", "Circle open", "Circle close", "Diagonal wipe", "Clock wipe", "Pixelate", "White flash". Slider: value only ("0.50 s"), from 0.3 s up to half of the shorter neighbouring clip (1.0 s at most), step 0.05 s; picking a type sets 0.5 s or the most that fits | Note when the clips are too short: "Clips are too short for a transition here". The slider is disabled at "None" or when the clips are too short. Empty state on the last clip: "No clip after this one" |
| **Animate** → "Animation" (clip or layer) | Clip, layer | Tabs "In", "Out", "Combo" (always opens on "In"). In and Out, the same 11 tiles: "None", "Fade", "Slide left", "Slide right", "Slide up", "Slide down", "Zoom in", "Zoom out", "Spin", "Pop", "Rise"; slider "Length" "0.50 s" (0.1–2 s, step 0.05, default 0.5). Combo, 7 tiles and no slider: "None", "Slow zoom in", "Slow zoom out", "Pan left", "Pan right", "Sway", "Pulse" | Header action "Apply to all clips" (not for a layer). The slider is disabled at "None". For a photo, Combo offers only "None", "Sway" and "Pulse" (zooms and pans live in Motion) unless the photo already has one of the others. Picking a Combo removes In and Out, and the other way round. The tabs do not show which of them holds something |
| **Animate** → "Animation" (text or sticker) | Text, sticker (captions have none) | Tabs "In", "Out", "Loop". In and Out: the same 11 tiles as above, with "Length" "0.50 s" (0.10–2.00 s, step 0.05). Loop, 7 tiles and no slider: "None", "Wiggle", "Pulse", "Spin", "Float", "Blink", "Shake" | In, Out and Loop are independent. The slider is disabled at "None". A tile tap gives a haptic |
| **Motion** → "Motion" | A photo without keyframes that is not a collage cell | Eight tiles: "None", "Zoom in", "Zoom out", "Pan left", "Pan right", "Pan up", "Pan down", "Corner zoom". Slider "Strength" "50 %" (0–100 %, step 5 %, default and rest tick 50 %) | Header action "Apply to all photos" (not for a layer). The slider is disabled at "None" |
| **Mask** → "Mask" | Clip, layer | Three tiles, each drawing its shape: "None" (sharp square), "Rounded", "Circle" | — |
| **Blend** → "Blend" | Layers only | Six tiles: "Normal", "Screen", "Multiply", "Overlay", "Lighten", "Darken" | Note: "Shows in the exported video". Today all six tiles show the same drawing — make each show its effect |
| **Opacity** → "Opacity" | Clip, layer | One slider: "Opacity" "100 %" (0–100 %, step 1) | — |
| **Transform** → "Transform" | Clip, layer | Six action tiles, each acting at once while the strip stays open: "Rotate 90°", "Flip horizontal", "Flip vertical", "Fit", "Fill", "Reset" | No on / off state is shown for the flips today |
| **Green screen** → "Green screen" | Clip, layer | A switch (no visible label today) on the leading side; then two chips "Green" and "Blue" and eight round colour swatches (light grey `#F4F4F5`, yellow `#F5C542`, red `#C8102E`, blue `#2E86AB`, gold `#D9B36A`, black, white, mint `#00E5A0`). Slider "Strength" "50 %" (0–100 %, step 1, default 50 %) | Note: "Shows in the exported video" — or, when the colour cannot be keyed: "This colour is too grey to remove. Pick a stronger colour." Everything but the switch is dimmed and inert while it is off. No custom colour and no eyedropper today |
| **Ratio** → "Aspect ratio" | Main bar; the ratio pill in the transport row | Nine tiles, each drawing a small outlined rectangle of that shape: "Auto" (dashed, drawn in the first clip's shape), "1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9" | Note: "Auto fits your first clip. 9:16 for TikTok, Reels and Shorts. 16:9 for YouTube." The strip stays open so shapes can be tried one after another |
| **Background** → "Background" | Main bar, main clip (not layers) | Round swatches with no labels: black, a pill reading "Blur", then light grey, yellow, red, blue, gold, white, mint (the same seven colours as above without black) | Header action "Apply to all". It fills the frame around a clip that does not cover it. No custom colour; the black swatch is nearly invisible on today's page |
| **Volume** → "Volume" (sound bar) | A selected sound bar | One slider: "Volume" "100 %" (0–200 %, step 5 %, default and rest tick 100 %). The preview is capped at 100 % | Note: "Above 100% only applies in the exported video." |
| **Fade** → "Fade" | A selected sound bar | Two sliders: "Fade in" and "Fade out", each "0.0 s", from 0 to half the bar's length (5 s at most), step 0.05 s | Disabled for a bar too short to fade |

### 12.2 Speed → "Speed" (multi-select "Speed · 3 clips" / "Speed · 1 clip")

Videos only: a clip, a layer, multi-select.

- **Tabs** on the leading side of the tile row: "Normal", "Curve", and — **only while exactly one clip is shown and it is slowed anywhere below 1×** — a third tab **"Slow motion"**. The strip opens on the tab the clip's speed lives on. If the clip stops being slowed while the third tab is open, the strip falls back to "Normal".
- **Header notes** (small, stacked): "Clip length 4.2 s" (hidden while the curve warning shows) · Normal tab: "Audio keeps its pitch in the exported video." — or, if the clip has a curve: "A curve is active — moving this slider removes it." · Curve tab with Smooth on: "Slow parts can look choppy."
- **Normal tab.** Six chips: "0.25×", "0.5×", "1×", "1.5×", "2×", "4×" (the one matching the current speed is selected and follows the slider live). Slider: "Current speed:" + value such as "1.5×"; range 0.25× to 4×, step 0.05, rest tick at 1×. If a curve is active the label is just "Speed" with no value and the slider looks inactive (it still works; moving it removes the curve).
- **Curve tab.** Seven tiles, each with a tiny chart of the speed across the clip: "None" (a flat line), "Montage", "Hero", "Bullet", "Jump cut", "Flash in", "Flash out". Bottom row: the word "Smooth" with a switch (on by default for a clip with no curve). With Smooth on, the chart is one flowing outline (32 thin bars); off, 8 separate bars. Switching rewrites the clip's current curve in the other form.
- **Slow motion tab — Smooth slow motion.** Tile row: one switch with the label "Smooth slow motion". Bottom row: one status line, with a small activity indicator in front while working. It makes the slowed picture fluid by adding in-between frames, as a background copy (14.1). This is **not** the Curve tab's "Smooth" switch (that one shapes how the speed changes; this one is about the picture) — the two similar names are a known confusion: make the difference obvious.
  - Status line, exactly one of: off: "Fills the gaps between frames with blended ones. The copy takes about 12 MB." (the number varies) · on, not started: "Waiting to start." · working: "Smoothing the slow motion: 37 %" · done: "Ready." · failed: "Could not smooth the slow motion. Switch it off and on to try again." · clip too long: "Smooth slow motion works on clips up to 60 seconds. Trim or split this clip first." · Remove background is on for this clip: "Smooth slow motion does not work together with Remove background. Switch Remove background off for this clip first." · installed app too old: "Stabilize and Smooth slow motion need the latest Clipy build. Install it from the newest build link." · source file gone: "The file of this clip is missing."
  - Switching off is never refused. Switching on when it cannot work shows the matching sentence above as a message and leaves the switch off. If the copy fails later: "Could not smooth the slow motion. The clip shows as it was."
- **Messages for the other tabs:** "This clip is too short for a smooth curve. Switch Smooth off." / "These clips are too short for a smooth curve. Switch Smooth off." (the strip stays open) · "This clip is too short for a smooth curve." / "These clips are too short for a smooth curve." (when the switch is turned on and refused) · "This clip is too short for a speed curve." / "These clips are too short for a speed curve." (the strip closes first) · "That speed doesn't fit this layer." (the strip closes first).

### 12.3 Cut out → "Remove background"

A clip or a layer; not on a reversed clip. People only.

- Header note: "Edges are not perfect".
- Row 1: a switch, then the sentence "The phone finds the person and hides everything else."
- Row 2: one status line, with a small activity indicator while working. Exactly one of: off: "People only. The copy takes about 12 MB." (a photo always says about 5 MB) · clip too long: "Remove background works on clips up to 60 seconds. Trim or split this clip first." · on, not started: "Waiting to start." · working, video: "Preparing the cut-out: 37 %" · working, photo: "Preparing the cut-out." (no percent) · done: "Ready." · no person: "No person was found in this clip." · other failure: "Could not remove the background. Switch it off and on to try again." · installed app too old: "Beats in your own music and Remove background need the latest Clipy build. Install it from the newest build link." · source file gone: "The file of this clip is missing."
- **Cannot be combined with Stabilize or Smooth slow motion on the same clip.** Switching it on then answers: "Remove background does not work together with Stabilize or Smooth slow motion. Switch those off for this clip first."
- The copy is prepared in the background, one at a time, starting shortly after the last edit; the clip looks unchanged until "Ready." While it is on, "Reverse" is hidden.
- Messages: "Could not remove the background. The clip shows as it was." / "No person was found in that clip. It shows as it was." / the 60-seconds sentence / the latest-build sentence.

### 12.4 Stabilize → "Stabilize"

A video clip or a video layer; not on a reversed clip. Sits next to "Cut out" on the toolbar.

- Header note: "Zooms in a little".
- Tile row, pick one: "Off", "Low", "Medium", "High". Today "Off" has an icon and the three strengths each draw three small rising bars with one, two or three filled. Stronger settings zoom the picture in more to hide the moving edges: **about 5 %, 10 % and 15 %** — show that trade-off in the tiles or the note.
- Bottom row: one status line, with a small activity indicator while working. Exactly one of: off: "Takes out the shake. The copy takes about 12 MB." (the number varies) · on, not started: "Waiting to start." · working: "Steadying the clip: 37 %" · done: "Ready." · failed: "Could not stabilize this clip. Tap the strength again to try again." · clip too long: "Stabilize works on clips up to 60 seconds. Trim or split this clip first." · Remove background is on for this clip: "Stabilize does not work together with Remove background. Switch Remove background off for this clip first." · installed app too old: "Stabilize and Smooth slow motion need the latest Clipy build. Install it from the newest build link." · source file gone: "The file of this clip is missing."
- "Off" brings the clip back at once and is never refused. Tapping the strength that is already selected retries a failed copy. Picking a strength when it cannot work shows the matching sentence as a message and changes nothing. If the copy fails later: "Could not stabilize the clip. It shows as it was."
- The original file is never changed; the clip shows as it was until the copy is "Ready."; while it is on, "Reverse" is hidden.

### 12.5 Redesign direction for strips — problems to solve

- "Pick one" is drawn four ways in sibling tools (icon tiles, text chips, picture tiles, bare colour circles). Transition has 21 text chips and no picture, while Animation's similar list has icons. Choose one system; prefer showing the result.
- Hidden state: the Animation tabs do not show which holds something; Transform does not show that a flip is on; Adjust marks a change only with a small dot.
- Disabled-but-present controls give no reason (Filter strength at "None", Animation length at "None", Motion strength at "None", Green screen's choices when off).
- Sliders without a name (Transition's length, Volume's level).
- "Apply to all clips" / "Apply to all" / "Apply to all photos" are three wordings for one idea, competing with the title and the note in the header.
- Long status sentences sit in a short row limited to two lines (Remove background, Stabilize, Smooth slow motion) and will be cut off on narrow phones. Give status its own readable place; shorten the sentences only as suggestions beside the originals.
- Background work is nearly invisible outside its own strip (see 14.1).
- Trim and Crop are the only tools that do not apply as you go; Trim's fields have no visible labels.
- Refusals often close the strip first and then explain in a toast, away from the control that caused them. Explain in place.
- No custom colour in Background or Green screen. The system colour picker would be the native answer; offer it as a marked suggestion only (it would be a new ability).
- Long labels in narrow tiles truncate: "Flip horizontal", "Slow zoom out", "Grid of four", "Row of three".

---

## 13. Panels — the tall inline tools (12) — and Crop

### 13.1 Summary

| Panel (button → title) | Opens from | Size | Tabs / header action |
|---|---|---|---|
| "Add text" / "Edit" → "Text" | Text section; a selected text or caption; double-tap on a text | regular | — |
| "Stickers" → "Sticker" (picker) | Main bar | regular | tabs "Emoji" / "Shapes" |
| "Edit" → "Sticker" (editor) | A selected sticker; double-tap on a sticker | compact | — |
| "Captions" → "Captions" | Text section; a selected caption | compact | — |
| "Style captions" → "Caption style" | Inside Captions (its Done returns to Captions) | regular, with a pinned sample | — |
| "Add audio" → "Add audio" | Audio section; a selected sound bar | regular | tabs "Music" / "Files" / "Effects" / "Record" |
| "Voice" → "Voice" | A sound bar; a video clip or layer (extracts the sound first) | compact | — |
| "Sound" → "Sound quality" | The same | compact | — |
| "Beats" → "Beat markers" | Audio section; a selected sound bar | regular | — |
| "Collage" → "Collage" | Main bar; a collage cell's layer bar | compact | action "Fit to frame" when relevant |
| "Cover" → "Cover" | Main bar | regular | action "Reset"; a fixed slider row |
| "Templates" → "Templates" | Main bar; a main clip | regular | tabs "This clip" / "Whole project" |

### 13.2 Text

Body, top to bottom (one long scrolling column today):

1. **Text field** — multi-line, focused on opening, placeholder "Your text". Edits show live on the video. One unbroken run of typing is one undo step.
2. **Look row** (texts only, not captions) — a sideways row of 24 one-tap looks, each a sample showing "Aa" drawn in the real look with its name: "Clean title", "Bold pop", "Neon", "Subtitle bar", "Comic", "Retro", "Handwritten", "Elegant", "Shadowed", "Outline only", "Sticker label", "Soft glow", "Headline", "Neon outline", "Soft shadow", "Sticky note", "Title bar", "Stamp", "Bubblegum", "Cinema", "Gold", "Chalkboard", "3D pop", "Watermark". A look replaces the whole style (font, colour, background, outline, all style values, the In and Loop animation); the words, position, size, alignment and timing stay. A tile is an action — none is ever shown as selected.
   What each look is, so the samples can be drawn: Clean title = white Poppins with a faint shadow · Bold pop = white Anton with a thick black edge, pops in · Neon = pale pink with a hot-pink glow · Subtitle bar = white on a black 75 % bar · Comic = yellow Bangers with a black edge and a hard drop shadow · Retro = pixel-font arcade yellow with a red drop · Handwritten = white Caveat · Elegant = champagne serif, wide spacing · Shadowed = white Oswald with a strong shadow · Outline only = dark fill inside a white edge · Sticker label = dark rounded letters on solid yellow · Soft glow = warm white with an amber halo · Headline = white on a square red block · Neon outline = near-black letters with a glowing green edge · Soft shadow = cream letters on a violet shadow · Sticky note = marker handwriting on a square yellow note · Title bar = white on a tight square dark-blue strip · Stamp = red capitals on a cream label · Bubblegum = white script with a pink edge · Cinema = thin, very widely spaced white · Gold = golden script with a glow · Chalkboard = chalk handwriting on dark green · 3D pop = white with a purple edge and a mint copy behind · Watermark = half see-through white.
3. **"Read aloud"** (texts only) — a collapsible row, closed at first (13.3).
4. **Font row** — 16 buttons, each showing the font's name written in that font: "Bangers", "Anton", "Oswald", "Montserrat", "Pacifico", "Marker", "Lobster", "Roboto", "Bebas Neue", "Poppins", "Playfair", "Fredoka", "Caveat", "Press Start", "Righteous", "Dancing Script".
5. **Five look rows** — each a collapsible row, all closed at first. Four have a switch on the trailing side: turning it on opens the row, turning it off closes it. Every slider inside applies live.
   - **"Outline"** (on for a new text): a chip "Auto" (the app picks the colour) followed by a colour row; slider "Thickness" "1.00×" (0.50×–3.00×).
   - **"Shadow"** (off; turning on gives black, 60 %, distance 6, blur 10): a colour row; "Shadow opacity" "60 %" (0–100 %); "Distance" "6" (0–30); "Blur" "10" (0–50).
   - **"Background"** (off; turning on gives a black box at 60 %): a colour row; two chips "Rounded" / "Square"; "Padding" "25" (0–60); "Box opacity" "60 %" (20–100 %).
   - **"Spacing and opacity"** (no switch, always available): "Opacity" "100 %" (0–100 %); "Letter spacing" "0" (−5 to 30); "Line spacing" "1.00×" (0.80×–2.00×).
   - **"Glow"** (off; turning on gives white, size 25): a colour row; "Size" "25" (5–60).
6. **"Size"** slider — "Size 7%"; 2 %–25 % of the frame's height; a new text is 7 %.
7. **Colour row** — the text's colour: eight round swatches (off-white `#F4F4F5`, yellow `#F5C542`, red `#C8102E`, blue `#2E86AB`, gold `#D9B36A`, black, white, mint `#00E5A0`) and a field with the placeholder "#RRGGBB" (applied when focus leaves and the value is a valid 6-digit code).
8. **Alignment** — three choices "Align left", "Align center", "Align right" (wide text chips today that wrap on narrow phones).
9. **"Fine-tune"** — a disclosure (today a text link with a "▼" / "▲" character) showing six number fields: "X %", "Y %", "Scale", "Rotation °", "Start s", "End s". X / Y / Scale / Rotation are read and written at the playhead (the keyframe there, when the text has keyframes).
10. **Two buttons** — "Duplicate" (disabled while the text is empty; the copy is selected and the panel switches to it) and destructive "Delete" (deletes and closes the panel).

A new text is: "Your text", the font Bangers, off-white, size 7 %, outline on, no background, centred, no animation. For a **caption** the same panel shows without the look row and without "Read aloud".

**Redesign direction.** One long scroll of ten blocks with no grouping; Size and Colour sit far below the font; Duplicate / Delete are at the very bottom and also on the toolbar. Organise it (for example a segmented control for groups such as Looks / Font / Style / Position) while keeping every control. Use a segmented control with symbols for alignment, the system disclosure for "Fine-tune", and one disclosure style for all rows. Swatches are below the 44-pt target, and the "#RRGGBB" field is the only way to any other colour. Looks never show which one is applied — consider a "current look" cue.

### 13.3 Read aloud (a row inside the Text panel)

Turns a text into a spoken voice bar on the audio row, using the voices installed on the iPhone. Texts only.

- **Closed:** a row "Read aloud" with a disclosure mark.
- **Open — loading:** an activity indicator (VoiceOver: "Loading voices"; nothing written on screen today).
- **Open — list failed:** "Could not read the list of voices. Close and open this row to try again."
- **Open — no voices:** "No voices are installed on this iPhone."
- **Open — ready:** (1) a sideways row of language choices, one per language that has a voice, the phone's own language first (names come from iOS, for example "English (United States)"); (2) a sideways row of voices for that language, best quality first, each showing the voice's name with " · Enhanced" or " · Premium" where it applies (for example "Ava · Premium") — the list is whatever the iPhone has, and can hold dozens; (3) a "Speed" slider whose value is a word: "Speed Slower", "Speed Normal", "Speed Faster"; (4) an action slot: the button "Read aloud" — or, while the phone prepares the voice, an indicator (VoiceOver: "Preparing the voice") beside a quiet "Stop"; (5) a hint: "These are the voices installed on this iPhone. More can be added in the iPhone Settings, under Accessibility."
- The voice and the speed are remembered on the phone (not part of the project, not undoable).
- **Result:** the preview pauses, the phone speaks into a file, and one voice bar appears on the audio row starting where the text starts, titled with the first 24 characters of the text. Message: "The voice is on the audio row, under the text." Reading the same text again replaces the earlier bar where it stood, keeping its volume, fades and sound settings: "The voice was replaced on the audio row." One undo step. It stops at once on "Stop", on closing the row or the panel, or when the panel moves to another text. Emoji and symbols in the text are skipped when reading.
- **Refusals and failures:** "Only a text can be read aloud." · "There is nothing to read in this text." · "This text is too long to read aloud." (over 1000 characters) · "You have reached the audio track limit." · "Pick a voice first." · "Could not read this text aloud." · "The text changed, so nothing was read. Tap Read aloud again." · installed app too old: "Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link." (the row stays closed).

**Redesign direction.** Two sideways rows that can hold dozens of chips are hard to scan: pop-up menus for language and voice are the native answer. Put words next to every indicator.

### 13.4 Sticker picker

- Tabs "Emoji" and "Shapes". On the Emoji tab, seven pack choices follow: "Faces", "Hands", "Hearts", "Food", "Travel", "Symbols", "More" (the selected one is marked; none is marked while a search is typed; tapping a pack clears the search).
- **Emoji tab:** a search field, placeholder "Search" (searches all emoji by name and keyword, at most 60 results; while the keyboard is up the tab row hides and the panel shrinks). **Recents:** with no search text and the keyboard down, the last used emoji (up to 24) come first, with no heading today. **Grid:** eight columns, scrolling vertically; 1,914 emoji (Faces 131, Hands 44, Hearts 26, Food 131, Travel 219, Symbols 238, More 1,125). Tapping an emoji adds it at the playhead for 3 seconds, centred, selects it and closes the panel.
- **Shapes tab:** a colour row (starts on yellow) setting the colour the shapes are drawn and added in; a grid of 20 shapes with names: "Circle", "Square", "Box", "Arrow", "Star", "Bubble", "Heart", "Curved arrow", "Two-way arrow", "Round bubble", "Sharp bubble", "Thought bubble", "Seal badge", "Award ribbon", "Banner", "Sparkle", "Burst", "Frame", "Ring", "Corner marks". Tapping a shape adds it the same way.
- **Redesign direction:** an emoji search with no match shows an empty grid and no message; recents have no heading; this panel and the editor below share the title "Sticker".

### 13.5 Sticker editor (compact)

Colour row (shapes only — an emoji has no colour) · "Size" slider "100%" (20 %–500 %; with keyframes the drag writes the keyframe at the playhead) · "Fine-tune" with the same six fields as Text ("X %", "Y %", "Scale", "Rotation °", "Start s", "End s") · "Duplicate" and destructive "Delete".

### 13.6 Captions (compact)

Automatic captions from the speech in the clips, made on the phone with Apple's speech recognition in the phone's own language (there is no language picker). Closing the panel while it works cancels the work. One state at a time:

| State | Content |
|---|---|
| Update needed | "Captions need the native build" / "Transcription runs on your iPhone with Apple's speech recognizer, which Expo Go can't load." / button "Style captions" (opens Caption style on a sample) |
| Ready, no captions yet | Primary "Transcribe" / "Uses on-device speech recognition. Clips: N" |
| Ready, captions exist | "Replace existing captions?" then primary "Replace", "Style captions", quiet "Cancel" (closes the panel) |
| Working | "Transcribing clip 2 of 5…", a progress bar that advances one clip at a time, "Cancel" |
| Done | "Added captions." / when some clips had no speech: "No speech found in: clip 1, clip 3" / "Style captions" |
| Error | The message and one primary button. Permission refused: "Clipy needs Speech Recognition permission to transcribe your clips. Turn it on in Settings, then try again." with "Open Settings". Anything else: the system's own sentence (for example "Speech recognition is not available for this language on this device") with "Try again" |

Photos, reversed clips and clips with a missing file are skipped. A new run replaces all captions (one undo step). Captions are split into lines of at most 40 characters and 3 seconds; each starts in the "Classic bar" look (white on a black 60 % box, centred, low in the frame). A caption can be selected like a text and edited in the Text panel; it has no animation and no keyframes.

**Redesign direction.** No language choice is shown (the phone's language is used silently — at least say which); progress moves only per clip; "Clips: N" counts clips that will be skipped.

### 13.7 Caption style (regular, pinned sample)

Restyles every caption at once; everything applies live.

- **Pinned sample** (stays in view while the body scrolls; hidden while typing): the sentence "This is how captions look" drawn in the current look; with the highlight on, the second word is shown in the highlight colour.
- **Body:** (1) six one-tap presets with an "Aa" sample: "Classic bar" (white on a black 60 % box), "Bold outline" (white Anton with a black edge), "Yellow pop" (yellow Bangers with a black edge and a hard shadow), "Clean white" (white Poppins with a soft shadow), "Neon glow" (pale cyan with a cyan glow), "Karaoke" (white with a black edge, the spoken word turning yellow); (2) when the project has no captions yet: the note "Preview only — captions need the full app build" (the controls then change only the sample); (3) a row "Highlight spoken word" with a switch, and when on a colour row under it (default yellow); (4) the font row (the same 16 fonts); (5) "Size" slider "5%" (2 %–10 %); (6) a colour row (caption colour); (7) a number field "Y %" (vertical position); (8) the same five look rows as the Text panel.

### 13.8 Add audio (regular)

Tabs "Music", "Files", "Effects", "Record".

- **List rows** (Music and Effects): a play button on the leading side (turning into stop while that item plays as a sample), the title over a small detail line, and a compact button on the trailing side. A sample mixes with the project's playback and stops at its end, on another tab, and when the panel closes; one at a time.
- **Music** — 8 bundled tracks, no categories and no search; detail "m:ss · CC0"; button "Use": "Party Sector" 1:36 · "Funked Up" 1:06 · "Happy Adventure" 0:46 · "Bossa Nova" 0:59 · "The Frigid Seas" 1:09 · "Piano" 0:32 · "The Field of Dreams" 1:24 · "Mandatory Overtime" 0:40. Empty wording, if there were none: "No bundled tracks yet — use Files."
- **Files** — a single primary button "Choose a file" → the system Files picker for audio (no permission needed). A file over 50 MB shows the alert "Large file" / "This file is over 50 MB. Add it anyway?" with "Cancel" and "Add". The bar is titled with the file's name.
- **Effects** — 10 built-in sound effects; detail is the length; button "Add": "Whoosh" (0.6 s), "Swoosh" (0.3 s), "Pop" (0.1 s), "Click" (0.1 s), "Ding" (0.9 s), "Beep" (0.2 s), "Riser" (1.5 s), "Drop" (0.7 s), "Tick" (0.1 s), "Chime" (1.2 s).
- **Record** — a timer "0:00"; one large round record button (microphone glyph when idle, stop glyph while recording; VoiceOver "Start recording" / "Stop recording"; dimmed while starting or saving); a status line "Recording…" then "Saving…"; the note "Plays your video while you talk. Other sound is muted while recording." Flow: tap → the microphone permission the first time (section 8) → the video plays from the playhead with its sound muted and the timer counts → tap again to stop. The recording becomes a voice bar titled "Voice-over" starting where recording began, selected, and the panel closes. Recording also stops and saves by itself at the end of the video or when playback is paused, and when Done, another tab or Export is tapped. There is no countdown, no level meter and no pause today. Messages: "Add a clip before recording." · "You've reached the audio track limit." · "Microphone access is needed to record." · "Couldn't start recording." · "That recording was too short." · "Couldn't save that recording."
- **Adding** copies the file into the project, starts a bar at the playhead, selects it and closes the panel. While a file is copied all "Use" / "Add" / "Choose a file" buttons are disabled (no indicator today). Messages: "Move the playhead back to add audio here." · "You've reached the audio track limit." · "Couldn't add that audio file."

**Redesign direction.** Use the "recording" symbol effects and a clear recording state, with no haptics while the microphone is live; a refused microphone gets the inline "Open Settings" state from section 8 instead of a toast. The Files tab is a lone button with no word about formats or the 50 MB check. The licence code "CC0" means nothing to users. Effect lengths show one decimal, so two read "0.1 s". A countdown and a level meter would be new abilities: marked suggestions only.

### 13.9 Voice (compact) and Sound quality (compact)

Both act on a sound bar. From a video clip or layer the sound is first moved to its own bar ("The sound of this clip is now its own bar."), then the panel opens.

- **Voice:** eight tiles: "None", "Deep", "High", "Chipmunk", "Robot", "Echo", "Hall", "Telephone" · "Strength" slider "50 %" (0–100 %, step 5 %, rest tick 50 %; disabled until a voice other than None is picked) · "Pitch" slider, a signed whole number ("0", "+3", "-5"; −12 to +12, rest tick 0; works with or without a voice) · a note row: "Pick a voice to set its strength."
- **Sound quality:** five tiles: "None", "Bass boost", "Clear voice", "Warm", "Bright" · a switch row "Even out loudness" · a switch row "Reduce noise" with a second line "Best on speech. Music can sound odd." · "Strength" slider "50 %" (0–100 %, step 5 %; disabled until Reduce noise is on; 0 % is still on, at its lightest).
- **Behaviour for both:** while a slider is held nothing is re-made and that bar plays its original sound; on release the changed copy is made in the background (14.1), then the preview switches to it. Today the only sign is a bare activity indicator in the header (VoiceOver: "Preparing the sound") — no words, no percent, although progress is known. A copy with Reduce noise can take minutes (up to 10; the others up to 2).
- **Messages:** "Could not prepare that sound. It plays as recorded." · installed app lacks the sound tools: "Voice and sound effects need the latest Clipy build. Install it from the newest build link." (the panel does not open from the toolbar) · Reduce noise in an app without it: "Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link." · on an iPhone that cannot do it: "This iPhone cannot reduce noise."

### 13.10 Beat markers (regular)

Top to bottom:

1. Primary **"Tap"** (full width) — drops a marker at the playhead; meant to be tapped in time while the video plays (haptic). Nothing happens very close to an existing marker or at 300 markers (no message today).
2. A counter: "0 markers" / "1 marker" / "12 markers".
3. Two buttons: **"Find beats"** and **"Cut to beats"**.
4. A row: "Fewer" — a three-stop slider — "More" (every 4th beat / every 2nd beat (default) / every beat). Disabled unless the music's beats are known. After a Find, dragging it re-places the markers live.
5. A hint slot: one sentence, or an activity indicator while the phone listens (VoiceOver: "Listening to the music"; no words, no percent and no cancel today — closing the panel is the only way to stop).
6. When "Cut to beats" cannot run, one more line saying why: "Cut to beats needs beat markers." or "Cut to beats needs at least two clips."
7. Two buttons: **"Remove nearest"** (removes the marker closest to the playhead, if one is very near) and **"Clear all"** (stronger haptic, no confirmation). Both disabled at 0 markers.

- **Which sound "Find beats" uses:** the selected bar if it is music, otherwise the music bar that starts first; with no music, the selected bar of any kind.
- **Hint sentences:** bundled track with beats: "Find beats marks the beats of Party Sector." · bundled track without a steady beat (only "The Frigid Seas"): "The Frigid Seas has no steady beat. Tap the beat with Tap instead." (Find beats disabled) · the person's own file: "Find beats listens to {title} for a few seconds." · own file, installed app too old: "For your own music, Find beats needs the latest Clipy build. Until then, tap the beat with Tap." · no sound at all: "Add music to find its beats." (Find beats disabled) · a listening that timed out: "Couldn't finish listening to this song. Try a shorter piece."
- **Find beats** places markers along the music's stretch of the timeline (replacing markers inside that stretch, keeping all others); one undo step. Messages: "The beat markers are already in place." · "No beats in this part of the music." · "Only 300 markers fit. The last beats were left out." · "This sound is too short to find a beat in." · "Could not listen to this sound." · "Beats in your own music and Remove background need the latest Clipy build. Install it from the newest build link."
- **Cut to beats** shortens each main clip (never the last one) from its end so the cut lands on a marker, never leaving a clip under half a second. Texts, stickers, layers and sounds do not move. Messages: "Clips cut to the beat. Undo brings them back." or "Nothing more to cut."
- Markers appear as ticks on the timeline. Nothing here runs by itself.

### 13.11 Collage (compact)

- **Layouts**, each a tiny diagram of its cells in the project's frame shape: "Side by side" (2 cells), "Stacked" (2), "Big and two" (3), "Row of three" (3), "Grid of four" (4), "Inset" (2: a full-frame picture with a small one in the lower corner). Making a collage: all six are shown and a tap opens the photo picker for that many items. Editing: only layouts with the same number of cells are shown, the current one selected.
- Slider "Border" "0 %" (0–6 %, step 0.5 %). Slider "Corner" with a word: "Square", "Rounded", "Round". Both are disabled until a collage cell is selected.
- Header action "Fit to frame" appears only when the frame's shape was changed after the collage was made. While a collage is being made, an unlabelled activity indicator shows in the header.
- Messages: "This layout needs 3 photos or videos — you picked 2." · "Not enough room: this layout adds 3 layers and there is room for 1." · "A collage can hold 2 videos at most. Pick photos for the other cells." · "That video is too short." · "Only two video layers can play at the same time." · "Couldn't add those items."
- A collage is ordinary layers, one timeline row per cell (see the timeline-height problem in 10.6).

### 13.12 Cover (regular)

- Header action "Reset" (back to no cover).
- A fixed row under the header: one full-width slider with no label and no time shown — it scrubs through the whole video to choose the frame.
- Body: (1) the chosen frame in the project's shape, with the title drawn over a dark fade at its bottom (up to 2 lines); (2) a text field, placeholder "Add a title", with a counter "0 / 40"; (3) a message line when there is something to say: "Close the keyboard to save." / "Allow Photos access in Settings to save." / "Saved to Photos" / "Couldn't save the cover."; (4) primary "Save to Photos" (disabled while saving or while the keyboard is up).
- The slider and the title write live. The cover and its title also appear on the project's card on Home.

### 13.13 Templates (regular)

- Tabs "This clip" (disabled with no clip selected) and "Whole project".
- A grid of tiles with names: "Random" (a dice emoji today), then eight looks drawn as two flat colour bands: "Clean", "Retro", "Hype", "Cinematic", "Neon", "Soft", "Bold", "Minimal".
- After a tap, a line under the grid: "Applied Retro · tap Undo to revert"; the tapped tile is marked as selected.
- A template sets filter, speed and transition, and adds a title text and a sticker over the first 3 seconds; "Whole project" also restyles existing texts and captions.
- **Redesign direction:** two colour bands do not preview a look; show what each one does.

### 13.14 Crop (full screen)

Opened by "Crop" for the selected clip or layer; slides up over the editor.

- **Top:** "Cancel" on the leading side, the title "Crop", "Done" (primary) on the trailing side. Today the two buttons differ in height.
- **Picture area:** a still of the clip shown whole (for a video, the frame at the playhead; a flat placeholder until it loads), never rotated or flipped. Outside the crop box the picture is darkened. The **crop box** has an accent border, rule-of-thirds lines and four corner handles (VoiceOver: "Top-left corner", "Top-right corner", "Bottom-left corner", "Bottom-right corner"). Drag inside the box to move it; drag a corner to resize (kept to the chosen shape). No edge handles, no pinch, no rotate / flip / straighten, no size readout.
- **Shape choices** under the picture: "Free", "9:16", "1:1", "4:5", "16:9". Picking one reshapes the box at once (haptic). A shape the picture cannot hold silently stays on "Free".
- **"Reset"** under the choices: back to the whole picture and "Free".
- "Done" applies the crop as one undo step and closes; "Cancel" discards. It always opens on "Free" with the clip's current crop.
- **Redesign direction:** Apple recommends a full-screen presentation for exactly this kind of media editing — keep it full screen, with Cancel leading and Done trailing in the system bar. Say why a shape cannot be chosen.

---

## 14. Background copies, "update needed", limits and messages

### 14.1 Background copies — one pattern for all of them

These results are prepared in the background as a copy of the media, one at a time, while the person keeps editing:

| What | Where it is switched on | What shows today | Limits |
|---|---|---|---|
| Remove background | "Remove background" strip | Status line with percent, inside the strip only | Clips up to 60 s; people only |
| Stabilize | "Stabilize" strip | Status line with percent, inside the strip only | Clips up to 60 s; not with Remove background |
| Smooth slow motion | "Speed" strip → "Slow motion" tab | Status line with percent, inside the tab only | Clips up to 60 s; slowed clips; not with Remove background |
| Voice changer, Sound quality (incl. Reduce noise) | "Voice" / "Sound quality" panels | A bare indicator in the panel's header | Reduce noise can take minutes |
| Read aloud | The row in the Text panel | An indicator and "Stop" | Up to 1000 characters |
| Find beats in the person's own music | "Beat markers" panel | A bare indicator in the hint slot | 8 s of sound at least; gives up after 2 minutes |
| Captions | "Captions" panel | "Transcribing clip N of M…" with a stepped bar and "Cancel" | — |
| Collage being made, Freeze, importing clips, copying an audio file | Their own controls | An unlabelled indicator, a dimmed button, or nothing | — |

Rules that hold for all: the preview keeps showing the previous version until the copy is ready; the **"Preview" tag** shows while the picture is not the final one; nothing blocks editing; switching the setting off always works at once; the original file is never changed; Export prepares any copy that is still missing first, as the opening part of its progress.

**Design one consistent pattern** with these states — off (what it does and roughly how much space the copy takes) · waiting · working with a percent · ready · failed with a way to retry · not possible, with the reason — and three places where it shows:

1. **In the tool:** a readable status area with a determinate indicator and words — not a two-line 12-pt row.
2. **On the timeline:** a progress and "ready" cue on the clip or bar itself, so work is visible when the tool is closed.
3. **In the preview:** the "Preview" tag, which should be able to say why when tapped (for example "Stabilize is still preparing").

Add a way to cancel where there is none today (beat listening, sound copies). Every spinner gets words.

### 14.2 Limits the designs must be able to say

12 audio tracks · 300 beat markers · two video layers playing at the same time (plus a layer limit) · a collage holds at most 2 videos · 60-second clips for Remove background, Stabilize and Smooth slow motion · 20 items per New project, 30 per Quick edit · a 50 MB check for audio files · 1000 characters for Read aloud · 40 characters for a cover title · 50 undo steps. Two sentences exist for the same audio limit ("You've reached the audio track limit." and "You have reached the audio track limit."): pick one.

### 14.3 The "update needed" state

Some tools need a newer installed version of Clipy than the person has (during development this also covers a test environment called Expo Go that cannot load the video engine). Today this is said in three different ways — "the latest Clipy build", "the native build", "the full app build" — and it names "Expo Go", "Swift engine" and "development build" to ordinary users. The full list of current texts:

- "Voice and sound effects need the latest Clipy build. Install it from the newest build link."
- "Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link."
- "Beats in your own music and Remove background need the latest Clipy build. Install it from the newest build link."
- "Stabilize and Smooth slow motion need the latest Clipy build. Install it from the newest build link."
- "For your own music, Find beats needs the latest Clipy build. Until then, tap the beat with Tap."
- "Captions need the native build" / "Transcription runs on your iPhone with Apple's speech recognizer, which Expo Go can't load."
- "Preview only — captions need the full app build"
- "Export needs the native build" / "Rendering the final video uses Clipy's Swift engine, which Expo Go can't load. Install a development build to export." / "Everything else in Clipy works in Expo Go."
- "Apple sign-in works in the installed app, not in Expo Go."
- The build line on Accounts ("App build: …", "Expo Go (no video engine)").

**Design one "update needed" component** used everywhere: a symbol, a short headline (for example "Update Clipy to use {tool}"), one plain sentence, and — where it makes sense — one action. It appears in place, inside the tool that needs it, with room for a full sentence; never as a toast over the toolbar. Propose one plain wording and show it beside each original.

### 14.4 Toasts today, and what to do with them

Today every message that is not inside a tool is a **toast**: one pill, centred about 100 pt above the bottom edge regardless of what is there (Home's floating buttons, Post's pinned buttons, the editor's toolbar or an open tool), shown for 2.5 seconds, not tappable, holding full sentences that wrap to two or three lines. The permission toast says "Open Settings" but cannot be tapped.

Redesign direction: follow Apple's feedback guidance — put status next to what it describes; say why a command cannot run, in place; confirm success only for significant tasks; do not auto-dismiss something the person must read or act on. Sort every message in this brief into one of four kinds and design each kind once: (1) inline status or refusal next to its control, (2) a brief non-blocking confirmation, with "Undo" where that helps, in a place that never covers controls, (3) an inline error with an action ("Try again", "Open Settings"), (4) a system alert or confirmation dialog for essential, destructive or blocking cases. Keep the wording unless you offer an improvement beside it.

Editor messages not already quoted in sections 11–13: "Couldn't add those items." · "3 of 5 added" (pattern "N of M added") · "Couldn't add that item." · "Clipy needs Photos access to import photos and videos. Open Settings to allow it."

---

## 15. Deliverables — work in this order

**Deliver all of it, (a) to (h), in this order, without stopping for approval (section 0). Number the boards (1a, 1b … 2a …) so I can refer to them. If a reply runs out of room, end it with "Continued in the next message" and continue when I say "continue".**

**(a) Foundations**
- Colour: dark and light, semantic roles, the accent, the eight timeline kinds (with their second cue; Caption in its own hue), danger, with contrast ratios noted and the Increase Contrast variants.
- Type: every text role in the app mapped to an Apple text style, shown at default, largest standard and largest accessibility size.
- Spacing scale, corner radii (capsule / fixed / concentric), sizes taken from the kit.
- Materials: where regular glass, clear glass, standard materials and solid surfaces are used, and the fall-backs for Reduce Transparency, Increase Contrast and the clear-to-tinted glass setting. Include the editor's "glass chrome, never over the frame" rule as a diagram.
- Elevation without shadows near the video.
- Iconography: the full SF Symbols map (section 6), weights and sizes, filled / outline rule.
- A motion and haptics table: each interaction, its animation, duration, easing, the Reduce Motion version and the haptic.

**(b) Component library** — every component in 5.4, restyled natively, in every state (default, pressed, selected / on, disabled, busy, error; dark and light), plus the new ones this brief asks for: the background-copy status, the "update needed" component, the four kinds of message, the permission row, the permission inline state, the wizard page frame, the timeline clip and the eight bars with their handles, badges and progress cue.

**(c) The wizard and the permission flows** — all four pages; for each illustration a storyboard (key frames with timing and easing) and the Reduce Motion version; every permission in every state (8.4) on the wizard page, in Accounts and inline in its feature; the system alerts shown only as Apple's own component from the kit.

**(d) Every screen outside the editor** — launch, the sign-in page (three steps, as a sheet), Home (loading, empty, with projects, busy for New project and for Quick edit, a damaged project, the card's actions), the Aspect ratio and Quick edit sheets, Export (options, update needed, exporting, done, error), Post (signed out, not set up, loading, ready, each row state, posting, done, failed, the YouTube options, the leave confirmation, the broken-link state), Accounts (signed out, not set up, signed in with nothing connected, connected, expired, working, with the Permissions section), every alert and dialog. Each at the smallest and the largest iPhone, dark and light.

**(e) The editor** — loading, cannot open, an empty project, and then each of the 11 contexts with its toolbar (11.1–11.11); the preview with each kind of selection frame and the blur box; the timeline with every kind of bar, a selected clip with handles, snapping, a transition marker, beat ticks, missing media, a background copy in progress, and a crowded project (four layers, three kinds of sound, overlapping texts); each of the 22 strips (every tab of Speed and of both Animation strips; every status of Remove background, Stabilize and Smooth slow motion); each of the 12 panels (every tab and every state listed); Crop; the keyboard-up states (Text, emoji search, Cover title, Trim, Fine-tune fields, the "#RRGGBB" field); and one editor screen each for the largest accessibility text size, Reduce Transparency and Increase Contrast.

**(f) An interactive prototype** of the main journey: first launch → wizard → permissions → sign in or skip → Home (empty) → "New project" → pick media → aspect ratio → editor → select a clip → open Filter, Speed (with Slow motion) and Stabilize → add a text → add music → Export → progress → done → "Post to…" → Post.

**(g) The app icon** — layers and the six appearances (3.11).

**(h) A hand-off sheet** — token names and values (colour, type, spacing, radius, material); a spec for each component; the SF Symbol name for every icon; every animation's timing; every piece of wording you changed, beside the original; and **a list of every place the design deliberately departs from the current app** (new: the wizard, camera, notifications, the optional Live Activity, the Permissions section, light appearance, any optional additions you proposed).

---

## 16. Guard-rails

1. **Do not remove or merge features.** Every tool, control, state and message in this brief must have a place. Regrouping tools is welcome; dropping one is not.
2. **Do not rename tools.** Where a clearer name would help (10.6 lists the mismatches), show it as a suggestion beside the current name.
3. **iPhone, portrait only.** No iPad, landscape, Android or web layouts.
4. **No invented features.** The only additions allowed are the ones this brief names as new or as marked suggestions. Never show a control that does nothing.
5. **Respect section 4** in every editor design. If a design idea conflicts with a constraint, the constraint wins; mention the idea in your notes instead.
6. **Apple's surfaces stay Apple's:** system alerts, permission alerts, the photo picker, the Files picker, the share sheet, the camera, the Apple sign-in sheet and button. Show them with the kit's components; do not restyle them.
7. **Numbers come from Apple's kit or from this brief** — never from memory of older iOS versions, and never invented.
8. **Realistic content:** real-looking project names ("Lisbon weekend", "Mia's birthday"), durations and sizes; clip thumbnails as neutral placeholders (no recognisable people, brands or copyrighted footage); real wording from this brief, never lorem ipsum.
9. **Every text over video or over a cover picture must be legible** on bright, dark and busy images — show the worst case.
10. **Both appearances** for everything, and nothing that relies on colour alone.
11. **At the end, list every assumption you had to make** and every point where the developers must confirm something is possible (glass over the moving timeline, the photo-picker fall-back, the camera source, notifications, any optional addition).

---

## 17. References — build from Apple's own material

**Start here**
- Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- Apple Design Resources (all kits and templates): https://developer.apple.com/design/resources/
- iOS and iPadOS 27 UI Kit — Figma: https://www.figma.com/community/file/1651309003795292092/ios-and-ipados-27
- iOS and iPadOS 27 UI Kit — Sketch: https://www.sketch.com/s/04c24d8b-38fb-4afb-8836-36617e022f02
- Adopting Liquid Glass: https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass
- What's new in Apple design (change log): https://developer.apple.com/design/whats-new/
- iOS 27 overview: https://www.apple.com/os/ios/

**Icons and type**
- SF Symbols: https://developer.apple.com/sf-symbols/
- Fonts (SF Pro): https://developer.apple.com/fonts/
- App Icon Template for iOS 27 — Figma: https://www.figma.com/community/file/1645923469870515372/app-icon-template-ios-ipados-and-watchos-27
- App Icon Template — Sketch: https://sketch.com/s/a443d962-d989-4c5b-b1db-fb7fb3946995
- Icon Composer: https://developer.apple.com/icon-composer/

**Templates for specific parts of this brief**
- Sign in with Apple buttons — Figma: https://www.figma.com/community/file/1367916685468040146/sign-in-with-apple · Sketch: https://sketch.com/s/7cd7dbf4-41b2-4e90-bb00-2796ced3cf2b
- Live Activities — Figma: https://www.figma.com/community/file/1367915437752334285/live-activities · Sketch: https://sketch.com/s/d1e8992f-14c2-4eef-b29d-24a32c0c0ef9
- TipKit — Figma: https://www.figma.com/community/file/1367917705471226837/tipkit

**HIG pages used in this brief** (each at `https://developer.apple.com/design/human-interface-guidelines/` + the name)
`design-principles` · `designing-for-ios` · `materials` · `color` · `dark-mode` · `typography` · `layout` · `icons` · `sf-symbols` · `app-icons` · `branding` · `toolbars` · `tab-bars` · `scroll-views` · `sheets` · `menus` · `context-menus` · `pop-up-buttons` · `pull-down-buttons` · `buttons` · `sliders` · `segmented-controls` · `toggles` · `pickers` · `text-fields` · `search-fields` · `lists-and-tables` · `collections` · `progress-indicators` · `loading` · `feedback` · `alerts` · `action-sheets` · `activity-views` · `sign-in-with-apple` · `launching` · `onboarding` · `privacy` · `playing-haptics` · `motion` · `accessibility` · `voiceover` · `gestures` · `undo-and-redo` · `writing` · `live-activities` · `going-full-screen` · `playing-video` · `photo-editing`

**Other Apple pages**
- Selecting photos and videos (the system picker and permission): https://developer.apple.com/documentation/photokit/selecting-photos-and-videos-in-ios
- Meet Liquid Glass: https://developer.apple.com/videos/play/wwdc2025/219/
- Get to know the new design system: https://developer.apple.com/videos/play/wwdc2025/356/
- Say hello to the new look of app icons: https://developer.apple.com/videos/play/wwdc2025/220/
- Principles of great design: https://developer.apple.com/videos/play/wwdc2026/250/
- Communicate your brand identity on iOS: https://developer.apple.com/videos/play/wwdc2026/251/
- Craft clear names for features and labels in your app: https://developer.apple.com/videos/play/wwdc2026/290/
- All design videos: https://developer.apple.com/videos/design/

**Not confirmed while preparing this brief — take these from the kit, do not guess:** exact margins, bar heights, corner radii and glass values; the iPhone screen-size table; iOS button size names; type tracking values; the system grey and fill colours; list styles and swipe actions; the wording and layout of the system's photo-access choices and of the notification alert; the printed version name of the current SF Symbols release; whether the 27 kit adds new components. Apple publishes no guidance specific to video editors or timelines.
