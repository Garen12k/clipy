import type { VideoInfo } from "./adapters/types";
import type { CreatorInfo, TikTokPrivacy } from "./api";

/**
 * TikTok "Post now" (Direct Post) on the phone: the shape of its options, its rules and every sentence. Pure — nothing here talks to
 * the server. The server checks all of it again against TikTok's own answer; this only keeps the user from pressing Post in vain.
 */
export const TITLE_MAX = 2200;
/** The order "Who can see it" is offered in (the server sends the creator's options in this order too). */
export const PRIVACY_ORDER: readonly TikTokPrivacy[] = ["PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"];
export const PRIVACY_LABEL: Record<TikTokPrivacy, string> = { PUBLIC_TO_EVERYONE: "Everyone", FOLLOWER_OF_CREATOR: "Followers", MUTUAL_FOLLOW_FRIENDS: "Friends", SELF_ONLY: "Only me" };

export const HOW_TO_SEND = "How to send";
export const SEND_MODES = [{ value: "draft", label: "Send as draft" }, { value: "direct", label: "Post now" }] as const;
export const DRAFT_EXPLAINED = "Clipy sends the video to your TikTok inbox. You add the caption and post it in TikTok.";
export const CHECKING = "Checking your TikTok account";
export const WHO_CAN_SEE = "Who can see it";
export const ALLOW = { comment: "Allow comments", duet: "Allow duet", stitch: "Allow stitch" } as const;
export const TURNED_OFF = "Turned off in your TikTok settings.";
export const BRAND_SWITCH = "Promotes a brand or product";
export const YOUR_BRAND = "Your brand";
export const BRANDED_CONTENT = "Branded content";
/** TikTok's own wording for the three brand rules. */
export const BRAND_PICK = "You need to indicate if your content promotes yourself, a third party, or both.";
export const BRANDED_PRIVATE = "Branded content visibility cannot be set to private.";
const LABEL_PROMO = "Your video will be labeled as 'Promotional content'.";
const LABEL_PAID = "Your video will be labeled as 'Paid partnership'.";
const CONSENT_MUSIC = "By posting, you agree to TikTok's Music Usage Confirmation.";
const CONSENT_BRANDED = "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";
export const TAKES_MINUTES = "It may take a few minutes to appear.";
/** UNVERIFIED addresses (spec §11 U8): tap both on the first live run. */
export const MUSIC_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
export const BRANDED_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";
export const NEEDS_PERMISSION_HERE = "To post directly, TikTok needs one more permission. Reconnect TikTok and allow everything it asks for.";
/** Post now is switched on by a server secret; while it is off the sheet says this (the server's own words for `direct_off`) and offers no Reconnect. */
export const DIRECT_OFF = "Posting straight to TikTok isn't switched on yet. Choose Send as draft.";
/** Added to "Stop posting?" while a Post now upload runs: its last piece publishes by itself, so a stop cannot promise that nothing was posted. */
export const STOP_MAY_POST = "If TikTok already has the video, it may still post — check your TikTok profile.";
export const OPEN_OPTIONS = "Open the TikTok options to finish setting up Post now.";
export const CHOOSE_PRIVACY = "Choose who can see it in the TikTok options.";
export const DIRECT_NOT_READY = "Post now publishes to your TikTok profile.";
export const DIRECT_DONE = "Posted to TikTok. It may take a few minutes to appear.";

export interface DirectOptions {
  mode: "direct";
  /** Nothing is chosen until the user chooses: TikTok allows no default. */
  privacy: TikTokPrivacy | null;
  allowComment: boolean; allowDuet: boolean; allowStitch: boolean;
  /** The "Promotes a brand or product" switch; the two boxes count only while it is on. */
  brand: boolean; brandOrganic: boolean; brandContent: boolean;
  /** What TikTok said about the account when the sheet last showed Post now. Never sent to the server. */
  creator: CreatorInfo | null;
}

export const isDirect = (o: Record<string, unknown>): boolean => o.mode === "direct";
const flag = (v: unknown) => v === true;
const isCreator = (v: unknown): v is CreatorInfo => typeof v === "object" && v !== null && Array.isArray((v as CreatorInfo).privacyOptions) && typeof (v as CreatorInfo).nickname === "string";

/** The options as Post now reads them: anything missing or of the wrong kind is OFF / not chosen. */
export function readDirect(o: Record<string, unknown>): DirectOptions {
  return {
    mode: "direct", privacy: PRIVACY_ORDER.includes(o.privacy as TikTokPrivacy) ? (o.privacy as TikTokPrivacy) : null,
    allowComment: flag(o.allowComment), allowDuet: flag(o.allowDuet), allowStitch: flag(o.allowStitch),
    brand: flag(o.brand), brandOrganic: flag(o.brandOrganic), brandContent: flag(o.brandContent),
    creator: isCreator(o.creator) ? o.creator : null,
  };
}
/** Branded content (a paid partnership) is declared: the switch is on AND its box is ticked. */
export const isBranded = (o: DirectOptions) => o.brand && o.brandContent;

/** What goes to the server: the seven keys the server reads. The creator and the brand switch stay on the phone. */
export function sendDirect(o: DirectOptions): Record<string, unknown> {
  return { mode: "direct", privacy: o.privacy, allowComment: o.allowComment, allowDuet: o.allowDuet, allowStitch: o.allowStitch, brandOrganic: o.brand && o.brandOrganic, brandContent: isBranded(o) };
}

/** The patch for a fresh creator answer: it is kept, and only what is no longer possible is dropped (never anything switched ON). */
export function reconcile(o: DirectOptions, creator: CreatorInfo): Record<string, unknown> {
  return {
    creator,
    ...(o.privacy !== null && !creator.privacyOptions.includes(o.privacy) ? { privacy: null } : {}),
    ...(o.allowComment && creator.commentDisabled ? { allowComment: false } : {}),
    ...(o.allowDuet && creator.duetDisabled ? { allowDuet: false } : {}),
    ...(o.allowStitch && creator.stitchDisabled ? { allowStitch: false } : {}),
  };
}

/** "5 minutes", "1 minute", "90 seconds" — the same words as the server's refusal. */
export const lengthWords = (sec: number) => (sec >= 60 && sec % 60 === 0 ? `${sec / 60} ${sec === 60 ? "minute" : "minutes"}` : `${Math.floor(sec)} seconds`);

/** Why Post now cannot be sent yet, or null. */
export function directBlocker(video: VideoInfo, o: DirectOptions): string | null {
  if (!o.creator) return OPEN_OPTIONS;
  if (video.durationSec > o.creator.maxDurationSec) return `This TikTok account can post videos up to ${lengthWords(o.creator.maxDurationSec)}.`;
  if (o.privacy === null || !o.creator.privacyOptions.includes(o.privacy)) return CHOOSE_PRIVACY;
  if (o.brand && !o.brandOrganic && !o.brandContent) return BRAND_PICK;
  if (isBranded(o) && o.privacy === "SELF_ONLY") return BRANDED_PRIVATE;
  return null;
}

export const consentLine = (o: DirectOptions): string => (isBranded(o) ? CONSENT_BRANDED : CONSENT_MUSIC);
/** How TikTok will label the post, or null when nothing is declared. */
export const labelLine = (o: DirectOptions): string | null => (!o.brand ? null : o.brandContent ? LABEL_PAID : o.brandOrganic ? LABEL_PROMO : null);

/** The TikTok row's standing note for Post now: the consent is read on the screen that has the Post button. */
export function directNote(video: VideoInfo, o: DirectOptions): string {
  if (!o.creator || o.privacy === null || directBlocker(video, o) !== null) return DIRECT_NOT_READY;
  return `Posting to ${o.creator.nickname}. ${WHO_CAN_SEE}: ${PRIVACY_LABEL[o.privacy]}. ${consentLine(o)} ${TAKES_MINUTES}`;
}
