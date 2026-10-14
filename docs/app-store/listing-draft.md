# App Store listing — draft for the last step

A draft to copy into App Store Connect when Clipy is submitted. Nothing here has been sent anywhere. The character limits are Apple's; each field below fits them. Read it once and change anything that doesn't sound like you.

The app record already exists in App Store Connect as **Clipy Video Editor** (app id 6821282940, bundle id `com.astinos.clipy`).

---

## 1. Name, subtitle, promotional text

**Name** (30 characters max) — already set:
> Clipy Video Editor

**Subtitle** (30 max):
> Edit, caption and post reels

**Promotional text** (170 max — can be changed at any time without a review):
> Cut clips, add captions from your voice, music on the beat, text that types itself in, then post to TikTok, YouTube or X — or open it in Instagram — in a few taps.

## 2. Description (4,000 max)

> Clipy is a video editor made for short videos. Put your clips and photos on a timeline, make them look right, and send the finished video where it needs to go — all on your iPhone.
>
> EDIT
> • Trim, split, reorder, speed up or slow down, reverse and crop
> • Smooth speed ramps and smooth slow motion
> • Stabilize shaky clips
> • Layers, picture-in-picture and collages
> • Remove the background behind a person
> • Undo and redo — even after you close a project and come back
>
> TEXT AND CAPTIONS
> • Captions made from what is said in your video
> • Text in many fonts, with outline, shadow, glow and a background box
> • Animations: fade, slide, pop and more — and text that types itself in, letter by letter or word by word
> • Read your text aloud with a built-in voice
> • Stickers and emoji
>
> SOUND
> • Bundled music and sound effects
> • Record a voice-over with a 3-2-1 countdown and a level meter
> • Change a voice, reduce noise, even out loudness
> • Cut your clips to the beat of the music
>
> LOOK
> • Filters, adjustments, effects and transitions
> • Photo motion: slow zooms and pans over still pictures
>
> EXPORT AND POST
> • Export in the shape you need, with one-tap settings for social apps, messages or the best quality
> • Post straight to YouTube, TikTok and X from inside Clipy
> • Open the finished video in Instagram in one tap
> • Save a copy of a whole project to Files, iCloud Drive or AirDrop, and open it again later
>
> PRIVATE BY DESIGN
> Your projects and videos stay on your phone. Clipy has no ads and no tracking. You can use the editor without an account; signing in is only needed to post to your own accounts, and you can delete your account at any time from inside the app.

## 3. Keywords (100 max, commas, no spaces needed)

> video editor,reels,shorts,tiktok,captions,subtitles,slideshow,music,montage,trim,cut,collage,vlog

(97 characters. Apple already searches the name and subtitle, so words like "Clipy" and "edit" are not repeated here.)

## 4. Links and contact

- **Support URL:** https://garen12k.github.io/clipy/
- **Marketing URL:** (optional) https://garen12k.github.io/clipy/
- **Privacy policy URL:** https://garen12k.github.io/clipy/privacy.html
- **Copyright:** 2026 (your name as it should appear)
- **Contact for Apple's review team:** your name, phone and yasuoxastinos@gmail.com — this is not shown publicly.

## 5. Category and age rating

- **Primary category:** Photo & Video
- **Secondary category:** (optional) Entertainment
- **Age rating questionnaire:** everything "None" — Clipy has no violence, no mature content, no gambling, no unrestricted web browsing, no user-to-user chat inside the app. Expected result: **4+**. (Posting happens on the platforms' own services under their own age rules.)

## 6. App privacy ("nutrition label") — please check each answer

Apple asks what data the app **collects**: sent off the phone and kept. Based on what Clipy's server actually stores:

| Apple's data type | Collected? | Linked to the person? | Used for tracking? | Purpose |
| --- | --- | --- | --- | --- |
| Contact info → Email address | Yes, only when signed in with email (or the address Apple / Google share) | Yes | No | App functionality |
| Identifiers → User ID | Yes, when signed in | Yes | No | App functionality |
| User content → Other user content | Yes: the caption and options of a post, the connected account's name and picture | Yes | No | App functionality |
| Photos or videos | **Decide:** videos pass through the server only for X and are not kept — Apple's rule says data handled only in real time and not retained need not be declared. My reading: answer **No**. | — | — | — |
| Audio data | No (captions are made on the phone) | — | — | — |
| Usage data, diagnostics, location, contacts, purchases, health, browsing | No | — | — | — |

- **Tracking:** No. No ads, no analytics, no data shared with data brokers.
- Third parties that handle data to make the app work (not "tracking"): Supabase (the server), the email service that sends sign-in codes, and the platform the person chooses to post to.

## 7. Notes for Apple's review team

> Clipy works without an account: open it, choose "Continue Without an Account", tap New Project and pick any video. All editing and exporting is on the device.
>
> Signing in (email code, Sign in with Apple or Google) is only needed to connect a YouTube, TikTok or X account and post to it. Posting needs the reviewer's own accounts on those services, so it may be easiest to review editing and export without signing in. Account deletion: Accounts → Delete account.
>
> TikTok posting uses TikTok's sandbox until TikTok's own app review is complete; YouTube uploads may arrive private until Google's API audit is complete.
>
> The app uses the camera, microphone, photo library, speech recognition and notifications only when the matching feature is used; each permission's purpose is shown in its prompt.

## 8. Screenshots

Apple needs at least one set for the largest iPhone display (6.9-inch: 1320 × 2868 or 1290 × 2796 pixels, portrait). Up to 10. Suggested order — the first three matter most:

1. The editor with a colourful clip, a caption on the video and the timeline below — "Edit short videos on your iPhone"
2. Captions from speech with a word highlighted — "Captions from your voice"
3. The Text tool with a typewriter reveal — "Text that types itself in"
4. Music with beat marks on the timeline — "Cut to the beat"
5. Remove background on a person — "Remove the background"
6. Export presets — "One tap for social, messages or best quality"
7. The Post screen with YouTube, TikTok and X — "Post where you want"
8. Home with a few projects — "Your projects stay on your phone"

Take them on the phone (side button + volume up) with a real project after the next build, in dark mode, then add the short line above each in any simple editor — or send them to me and I'll prepare the frames.

## 9. Before pressing "Submit for Review" — things that must be true

- [ ] The next build is installed, the phone checklist (`docs/next-build-phone-checklist.md`) is done, and that build is the one selected for review.
- [ ] **Sign in with Apple works** — Apple requires it because Google sign-in is offered. It currently fails with "Sign Up Not Completed" (Apple's side). Either Apple fixes it, or Google sign-in is removed before submitting.
- [ ] **Sign in with Apple token revocation on account deletion** (Apple guideline 5.1.1(v)) — not built yet; needs a key from your Apple developer account.
- [ ] The privacy answers in section 6 match the privacy page.
- [ ] Export compliance: already answered in the app (`ITSAppUsesNonExemptEncryption: false`).
- [ ] Price: Free (or your choice) and the countries to sell in.
