import { useEffect, useRef, useState } from "react";
import { ScrollView, useWindowDimensions, View, type AccessibilityActionEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSession } from "@/src/publish/useSession";
import { theme } from "@/src/theme/theme";
import { IconButton } from "@/src/ui/IconButton";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { QuietButton } from "@/src/ui/QuietButton";
import { Screen } from "@/src/ui/Screen";
import { Body, Title } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { useSurfaces } from "@/src/ui/tone";
import { isReducedMotion } from "@/src/ui/useReducedMotion";
import { markWelcomeSeen } from "./welcomeSeen";
import { SignInBody } from "./WelcomeScreen";
import { FeatureTile, FEATURES, WizardMark } from "./WizardArt";

/** The four pages' words, as the owner approved them. */
export const WIZARD = {
  welcome: { title: "Make clips worth sharing", body: "Cut, style and post your videos, all on your iPhone.", button: "Get Started" },
  features: { title: "Everything you need to edit", button: "Continue" },
  permissions: { title: "Allow what Clipy needs", button: "Continue" },
  signIn: { title: "Sign in to post", body: "Post to YouTube, TikTok and more straight from Clipy." },
} as const;
export const WIZARD_PAGES = 4;
const LAST = WIZARD_PAGES - 1;
const SIGNED_IN = "You're signed in.";
const DOT = theme.space.sm;
const DOT_CURRENT = theme.space.xl;
const hidden = { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" } as const;

type Props = {
  /** Shown again from Accounts ("Show welcome again"): a close button, and neither the "seen" flag nor the session is touched by the wizard. */
  replay?: boolean;
  /** Called once, when the wizard is left: signed in, "Continue Without an Account", or closed. */
  onDone: () => void;
};

/**
 * The first-launch presentation: four pages — welcome, what the app can do, permissions, sign in — on ONE screen. Drawn in place by
 * app/index.tsx while the "seen" flag is not set (and again, as `replay`, by the /tour route). The pages are a horizontal paging
 * scroll view: the finger moves them, the buttons scroll it natively; nothing of ours animates a page change. The last page is the
 * sign-in page's own body (`SignInBody`): the same choices, steps, handlers and messages — not a copy.
 */
export function WelcomeWizard({ replay = false, onDone }: Props) {
  const s = useSurfaces();
  const session = useSession();
  const signedIn = session.status === "signedIn";

  // Leaving happens once, whoever asks first. First launch sets the "seen" flag here; a replay leaves it as it is.
  const left = useRef(false);
  function finish() {
    if (left.current) return;
    left.current = true;
    if (!replay) markWelcomeSeen();
    useToast.getState().clear();
    onDone();
  }
  // First launch, already signed in (a reinstall that kept its session): never the wizard — straight on, with the flag set.
  useEffect(() => { if (!replay && signedIn) finish(); }, [signedIn]);
  // A replay by someone who is signed in shows the last page as "signed in". Someone who signs in ON it leaves, as on the sign-in page.
  const wasSignedOut = useRef(false);
  if (session.status === "signedOut" || session.status === "unconfigured") wasSignedOut.current = true;

  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  /** Which pages have been the current one: each page's pictures play once, the first time. */
  const [reached, setReached] = useState<readonly boolean[]>([true, false, false, false]);
  /** The email or the code is being typed on the last page: the pages hold still. */
  const [locked, setLocked] = useState(false);
  const pager = useRef<ScrollView>(null);
  /** The page a button has sent the pager to; until it arrives the pages passed on the way do not count as current. */
  const jumping = useRef<number | null>(null);

  function show(i: number) {
    setPage(i);
    setReached((r) => (r[i] ? r : r.map((v, j) => v || j === i)));
  }
  function go(i: number) {
    if (i < 0 || i > LAST || i === page || locked) return;
    jumping.current = i;
    show(i);
    // The scroll view's own (native) scroll. With Reduce Motion the page is simply there.
    pager.current?.scrollTo({ x: i * width, animated: !isReducedMotion() });
  }
  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width <= 0) return;
    const i = Math.max(0, Math.min(LAST, Math.round(e.nativeEvent.contentOffset.x / width)));
    if (jumping.current !== null) { if (i === jumping.current) jumping.current = null; return; }
    if (i !== page) show(i);
  }
  function onDots(e: AccessibilityActionEvent) {
    if (e.nativeEvent.actionName === "increment") go(page + 1);
    else if (e.nativeEvent.actionName === "decrement") go(page - 1);
  }

  if (!replay && (signedIn || session.status === "loading")) return <Screen edges={["top", "bottom"]}>{null}</Screen>;

  return (
    <Screen edges={["top", "bottom"]}>
      <View testID="wizard-bar" style={{ height: theme.size.header, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.sm }}>
        {replay ? <IconButton name="close-outline" accessibilityLabel="Close" onPress={finish} /> : <View />}
        {page < LAST ? <QuietButton compact title="Skip" accessibilityLabel="Skip to sign in" onPress={() => go(LAST)} /> : null}
      </View>
      <ScrollView ref={pager} testID="wizard-pager" horizontal pagingEnabled bounces={false} showsHorizontalScrollIndicator={false} scrollEnabled={!locked}
        keyboardShouldPersistTaps="handled" scrollEventThrottle={16} onScroll={onScroll}
        onScrollBeginDrag={() => { jumping.current = null; }} onMomentumScrollEnd={() => { jumping.current = null; }} style={{ flex: 1 }}>
        <Page width={width} current={page === 0} title={WIZARD.welcome.title} body={WIZARD.welcome.body} button={WIZARD.welcome.button} onButton={() => go(1)}
          lead={<View style={{ alignItems: "center" }}><WizardMark play={reached[0]} /></View>} />
        <Page width={width} current={page === 1} title={WIZARD.features.title} button={WIZARD.features.button} onButton={() => go(2)}>
          <View testID="wizard-features" style={{ gap: theme.space.md }}>
            {[0, 2].map((from) => (
              <View key={from} style={{ flexDirection: "row", gap: theme.space.md }}>
                {FEATURES.slice(from, from + 2).map((f, i) => <FeatureTile key={f.id} {...f} index={from + i} play={reached[1]} />)}
              </View>
            ))}
          </View>
        </Page>
        <Page width={width} current={page === 2} title={WIZARD.permissions.title} button={WIZARD.permissions.button} onButton={() => go(LAST)} />
        <View testID="wizard-page-4" style={{ width }} {...(page === LAST ? null : hidden)}>
          {replay && signedIn && !wasSignedOut.current ? (
            <View style={{ flex: 1, paddingHorizontal: theme.space.gutter, paddingBottom: theme.space.lg, gap: theme.space.xl }}>
              <View style={{ flexGrow: 1, alignItems: "center", justifyContent: "center", gap: theme.space.sm }}>
                <Title size={theme.text.title1.size} accessibilityRole="header" style={{ textAlign: "center" }}>{WIZARD.signIn.title}</Title>
                <Body muted style={{ fontSize: theme.type.input, textAlign: "center" }}>{WIZARD.signIn.body}</Body>
                <Body style={{ textAlign: "center" }}>{SIGNED_IN}</Body>
              </View>
              <PrimaryButton title="Done" onPress={finish} />
            </View>
          ) : (
            <SignInBody first session={session} heading={WIZARD.signIn} mark={!replay} onDone={finish} onStep={(step) => setLocked(step !== "choose")} />
          )}
        </View>
      </ScrollView>
      {/* The dots: one control for VoiceOver ("Page 2 of 4", swipe up or down to change page). The current page is the wider pill. */}
      <View testID="wizard-dots" accessible accessibilityRole="adjustable" accessibilityLabel={`Page ${page + 1} of ${WIZARD_PAGES}`}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={onDots}
        style={{ height: theme.size.touch, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.sm }}>
        {Array.from({ length: WIZARD_PAGES }, (_, i) => (
          <View key={i} testID={i === page ? "wizard-dot-current" : "wizard-dot"} style={{ width: i === page ? DOT_CURRENT : DOT, height: DOT, borderRadius: theme.radius.pill, backgroundColor: i === page ? s.text : s.muted }} />
        ))}
      </View>
    </Screen>
  );
}

type PageProps = { width: number; current: boolean; title: string; body?: string; button: string; onButton: () => void; /** Above the title (the mark). */ lead?: React.ReactNode; children?: React.ReactNode };

/**
 * One of the first three pages: its picture, its title (a header — it wraps, never clips), its line, its content, and the gold
 * button at the foot. The page scrolls up and down by itself if a small phone at a large text size needs it. A page that is not the
 * current one is not offered to VoiceOver.
 */
function Page({ width, current, title, body, button, onButton, lead, children }: PageProps) {
  return (
    <View style={{ width }} {...(current ? null : hidden)}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: theme.space.gutter, paddingBottom: theme.space.lg, gap: theme.space.xl }}>
        <View style={{ flexGrow: 1, justifyContent: "center", gap: theme.space.xl, paddingVertical: theme.space.lg }}>
          {lead ?? null}
          <View style={{ gap: theme.space.sm }}>
            <Title size={theme.text.title1.size} accessibilityRole="header" style={{ textAlign: "center" }}>{title}</Title>
            {body ? <Body muted style={{ fontSize: theme.type.input, textAlign: "center" }}>{body}</Body> : null}
          </View>
          {children ?? null}
        </View>
        <PrimaryButton title={button} onPress={onButton} />
      </ScrollView>
    </View>
  );
}
