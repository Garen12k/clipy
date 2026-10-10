import { clientAdapters } from "../adapters";
import type { CreatorInfo } from "../api";
import { BRAND_PICK, BRANDED_PRIVATE, CHOOSE_PRIVACY, consentLine, DIRECT_DONE, DIRECT_NOT_READY, directBlocker, directNote, isDirect, labelLine, OPEN_OPTIONS, PRIVACY_LABEL, readDirect, reconcile, sendDirect, TITLE_MAX } from "../tiktokDirect";

const video = { fileUri: "file:///v.mp4", fileSize: 10, durationSec: 21, mimeType: "video/mp4" };
const creator: CreatorInfo = { nickname: "Sunny", username: "sunny", avatarUrl: null, privacyOptions: ["FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: true, maxDurationSec: 300 };
const ready = { mode: "direct", privacy: "SELF_ONLY", creator };
const tt = clientAdapters.tiktok!;
const MUSIC = "By posting, you agree to TikTok's Music Usage Confirmation.";
const BRANDED = "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";

test("only the exact mode is direct; a read fills every default with OFF and nothing chosen", () => {
  expect(isDirect({})).toBe(false);
  expect(isDirect({ mode: "draft" })).toBe(false);
  expect(isDirect({ mode: "direct" })).toBe(true);
  expect(readDirect({ mode: "direct" })).toEqual({ mode: "direct", privacy: null, allowComment: false, allowDuet: false, allowStitch: false, brand: false, brandOrganic: false, brandContent: false, creator: null });
  expect(readDirect({ mode: "direct", privacy: "EVERYONE", allowComment: "yes", creator: "x" })).toMatchObject({ privacy: null, allowComment: false, creator: null });
  expect(TITLE_MAX).toBe(2200);
  expect(PRIVACY_LABEL).toEqual({ PUBLIC_TO_EVERYONE: "Everyone", FOLLOWER_OF_CREATOR: "Followers", MUTUAL_FOLLOW_FRIENDS: "Friends", SELF_ONLY: "Only me" });
});

test("what is sent: the seven keys, never the creator or the brand switch; the brand boxes count only while the switch is on", () => {
  const o = readDirect({ ...ready, allowComment: true, brand: false, brandOrganic: true, brandContent: true });
  expect(sendDirect(o)).toEqual({ mode: "direct", privacy: "SELF_ONLY", allowComment: true, allowDuet: false, allowStitch: false, brandOrganic: false, brandContent: false });
  expect(sendDirect(readDirect({ ...ready, privacy: "FOLLOWER_OF_CREATOR", brand: true, brandOrganic: true }))).toMatchObject({ brandOrganic: true, brandContent: false });
});

test("the blockers, in order", () => {
  const b = (o: Record<string, unknown>, v = video) => directBlocker(v, readDirect({ mode: "direct", ...o }));
  expect(b({})).toBe(OPEN_OPTIONS);
  expect(OPEN_OPTIONS).toBe("Open the TikTok options to finish setting up Post now.");
  expect(b({ creator }, { ...video, durationSec: 301 })).toBe("This TikTok account can post videos up to 5 minutes.");
  expect(b({ creator: { ...creator, maxDurationSec: 90 } }, { ...video, durationSec: 91 })).toBe("This TikTok account can post videos up to 90 seconds.");
  expect(b({ creator: { ...creator, maxDurationSec: 60 } }, { ...video, durationSec: 61 })).toBe("This TikTok account can post videos up to 1 minute.");
  expect(b({ creator })).toBe(CHOOSE_PRIVACY);
  expect(CHOOSE_PRIVACY).toBe("Choose who can see it in the TikTok options.");
  expect(b({ creator, privacy: "PUBLIC_TO_EVERYONE" })).toBe(CHOOSE_PRIVACY); // no longer offered
  expect(b({ ...ready, brand: true })).toBe(BRAND_PICK);
  expect(BRAND_PICK).toBe("You need to indicate if your content promotes yourself, a third party, or both.");
  expect(b({ ...ready, brand: true, brandContent: true })).toBe(BRANDED_PRIVATE);
  expect(BRANDED_PRIVATE).toBe("Branded content visibility cannot be set to private.");
  expect(b({ ...ready, brand: true, brandOrganic: true })).toBeNull();
  expect(b({ ...ready, privacy: "FOLLOWER_OF_CREATOR", brand: true, brandContent: true })).toBeNull();
  // The boxes do not count while the switch is off.
  expect(b({ ...ready, brand: false, brandContent: true })).toBeNull();
  expect(b(ready)).toBeNull();
});

test("fresh creator info never changes a choice silently, except to drop what is no longer possible", () => {
  const had = readDirect({ mode: "direct", privacy: "PUBLIC_TO_EVERYONE", allowComment: true, allowDuet: true, allowStitch: true });
  expect(reconcile(had, creator)).toEqual({ creator, privacy: null, allowDuet: false, allowStitch: false });
  expect(reconcile(readDirect(ready), creator)).toEqual({ creator });
  expect(reconcile(readDirect({ ...ready, allowComment: true }), { ...creator, commentDisabled: true })).toEqual({ creator: { ...creator, commentDisabled: true }, allowComment: false });
});

test("the consent, the label line and the notes", () => {
  expect(consentLine(readDirect(ready))).toBe(MUSIC);
  expect(consentLine(readDirect({ ...ready, brand: true, brandOrganic: true }))).toBe(MUSIC);
  expect(consentLine(readDirect({ ...ready, brand: true, brandContent: true }))).toBe(BRANDED);
  expect(consentLine(readDirect({ ...ready, brand: false, brandContent: true }))).toBe(MUSIC);
  expect(labelLine(readDirect(ready))).toBeNull();
  expect(labelLine(readDirect({ ...ready, brand: true }))).toBeNull();
  expect(labelLine(readDirect({ ...ready, brand: true, brandOrganic: true }))).toBe("Your video will be labeled as 'Promotional content'.");
  expect(labelLine(readDirect({ ...ready, brand: true, brandOrganic: true, brandContent: true }))).toBe("Your video will be labeled as 'Paid partnership'.");
  expect(directNote(video, readDirect(ready))).toBe(`Posting to Sunny. Who can see it: Only me. ${MUSIC} It may take a few minutes to appear.`);
  expect(directNote(video, readDirect({ mode: "direct" }))).toBe(DIRECT_NOT_READY);
  expect(DIRECT_NOT_READY).toBe("Post now publishes to your TikTok profile.");
  expect(DIRECT_DONE).toBe("Posted to TikTok. It may take a few minutes to appear.");
});

test("the adapter in direct mode: options, the caption limit, what is sent, the notes; the video rules still come first", () => {
  expect(tt.hasOptions).toBe(true);
  expect(tt.captionLimit!({})).toBeNull();
  expect(tt.captionLimit!({ mode: "direct" })).toBe(2200);
  expect(tt.sendOptions!({})).toEqual({});
  expect(tt.sendOptions!({ mode: "draft", privacy: "SELF_ONLY", creator })).toEqual({});
  expect(tt.sendOptions!(ready)).toEqual({ mode: "direct", privacy: "SELF_ONLY", allowComment: false, allowDuet: false, allowStitch: false, brandOrganic: false, brandContent: false });
  expect(tt.validate(video, "", ready)).toBeNull();
  expect(tt.validate(video, "", { mode: "direct" })).toBe(OPEN_OPTIONS);
  expect(tt.validate({ ...video, durationSec: 601 }, "", ready)).toBe("TikTok accepts videos up to 10 minutes.");
  expect(tt.noteFor!(video, {})).toBe(tt.note(video));
  expect(tt.noteFor!(video, ready)).toBe(directNote(video, readDirect(ready)));
  expect(tt.doneNoteFor!({})).toBe("Sent to TikTok — open TikTok to finish posting.");
  expect(tt.doneNoteFor!(ready)).toBe(DIRECT_DONE);
});
