import { router, useNavigation } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, ScrollView, View } from "react-native";
import { formatBytes } from "@/src/export/estimate";
import { useEditorStore } from "@/src/editor/store";
import { nowIso } from "@/src/lib/clock";
import { formatDuration } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { useSurfaces } from "@/src/ui/tone";
import { Card } from "@/src/ui/Card";
import { Field } from "@/src/ui/Field";
import { haptic } from "@/src/ui/haptics";
import { Group } from "@/src/ui/Group";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Screen } from "@/src/ui/Screen";
import { ScreenBar } from "@/src/ui/ScreenBar";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { ToastHost, useToast } from "@/src/ui/Toast";
import { PLATFORMS, type PlatformId } from "../platforms";
import { useAccounts } from "../useAccounts";
import { usePost } from "../usePost";
import type { PostTarget } from "../postParams";
import { usePostForm } from "../usePostForm";
import { useSession } from "../useSession";
import { PostOptionsSheet } from "./PostOptionsSheet";
import { PostRow } from "./PostRow";
import { SignInCard } from "./SignInCard";

const small = { fontSize: theme.type.small } as const;
/** The small word above the caption box. */
const label = { fontSize: theme.type.label } as const;
/** The caption box's smallest height: about four lines. */
const CAPTION_MIN = 96;
const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

export function PostScreenBody({ target: { video, projectId, title, coverMs } }: { target: PostTarget }) {
  const s = useSurfaces();
  const session = useSession();
  const signedIn = session.status === "signedIn";
  const accounts = useAccounts(signedIn);

  const onPosted = useCallback((platform: PlatformId, url: string | null) => {
    haptic("success");
    const store = useEditorStore.getState();
    if (projectId && store.project?.id === projectId) store.addPostRecord({ platform, url, postedAt: nowIso() });
  }, [projectId]);
  const { rows, busy, start, retry, cancel } = usePost(video, onPosted);
  const form = usePostForm(video, accounts.platforms, title, rows, accounts.refresh, coverMs);
  const [optionsFor, setOptionsFor] = useState<PlatformId | null>(null);
  useLeaveGuard(busy, cancel);

  const onPost = () => { haptic("light"); start(form.jobs); };
  async function onShare() {
    try { await Sharing.shareAsync(video.fileUri, { mimeType: video.mimeType, UTI: video.mimeType === "video/quicktime" ? "com.apple.quicktime-movie" : "public.mpeg-4" }); }
    catch (e) { useToast.getState().show(e instanceof Error ? e.message : "Could not share the video."); }
  }
  const openUrl = (url: string) => { Linking.openURL(url).catch(() => useToast.getState().show("Couldn't open the link.")); };
  const spinner = <Spinner style={{ marginTop: theme.space.xl }} />;

  return (
    <Screen edges={["top", "bottom"]}>
      {/* Back is never disabled: while uploads run it asks "Stop posting?" (useLeaveGuard). */}
      <ScreenBar title="Post" leading="back" onLeading={goBack} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ padding: theme.space.gutter, gap: theme.space.lg }}>
          <Body muted>{`${formatDuration(video.durationSec)} · ${formatBytes(video.fileSize)}`}</Body>
          {session.status === "loading" ? spinner : null}
          <SignInCard />
          {!signedIn ? null : (<>
            <View style={{ gap: theme.space.xs }}>
              {/* The field carries the name for VoiceOver; this is the same word for the eye. */}
              <Body muted accessibilityElementsHidden importantForAccessibility="no" style={[label, { paddingHorizontal: theme.space.xs }]}>Caption</Body>
              <Field accessibilityLabel="Caption" multiline value={form.caption} onChangeText={form.setCaption} placeholder="Write a caption…"
                style={{ minHeight: CAPTION_MIN, textAlignVertical: "top" }} />
              {form.captionMax !== null ? (
                <Body muted style={[small, { alignSelf: "flex-end" }, form.overLimit ? { color: s.dangerText } : null]}>{`${form.caption.length} / ${form.captionMax}`}</Body>
              ) : form.anyTicked ? (
                // Only platforms that don't take the caption are ticked: no limit, never red.
                <Body muted style={[small, { alignSelf: "flex-end" }]}>{String(form.caption.length)}</Body>
              ) : null}
              {form.captionless.map((id) => {
                const { label } = PLATFORMS[id];
                return <Body key={id} muted style={small}>{`${label} doesn't receive this caption — you'll write it in ${label}.`}</Body>;
              })}
            </View>
            {accounts.status === "error" ? (
              <Card style={{ gap: theme.space.md, alignItems: "flex-start" }}>
                <Body>{accounts.error ?? "Something went wrong."}</Body>
                <SecondaryButton title="Try Again" onPress={accounts.refresh} />
              </Card>
            ) : accounts.status !== "ready" ? spinner : (
              <Group testID="post-platforms">
                {form.views.map((v) => (
                  <PostRow key={v.status.id} view={v} row={rows[v.status.id]} onToggle={() => form.toggle(v.status.id)} onOptions={() => setOptionsFor(v.status.id)}
                    onConnect={() => router.push("/accounts")}
                    onReconnect={() => { form.markReconnect(v.status.id); router.push("/accounts"); }}
                    onRetry={() => { const job = form.retryJob(v); if (job) retry(job); }} onView={openUrl} />
                ))}
              </Group>
            )}
          </>)}
        </ScrollView>
        {/* One row: the gold Post takes the width, Share… sits beside it. Without an account there is no Post, and Share… has the row to itself. */}
        <View testID="post-actions" style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.gutter, paddingTop: theme.space.md }}>
          {signedIn ? <View testID="post-actions-wide" style={{ flex: 1 }}><PrimaryButton title="Post" onPress={onPost} disabled={busy || form.jobs.length === 0} /></View> : null}
          {signedIn ? <SecondaryButton title="Share…" onPress={onShare} /> : <View testID="post-actions-wide" style={{ flex: 1 }}><SecondaryButton title="Share…" onPress={onShare} /></View>}
        </View>
      </KeyboardAvoidingView>
      <PostOptionsSheet platform={optionsFor} options={form.views.find((v) => v.status.id === optionsFor)?.options ?? {}}
        onChange={(patch) => optionsFor && form.setOption(optionsFor, patch)} onClose={() => setOptionsFor(null)} />
      <ToastHost />
    </Screen>
  );
}

/**
 * While uploads run, leaving (header Back, swipe, any pop) asks first; Stop cancels them and then leaves.
 * Expo Router v57 has no usePreventRemove, so this is React Navigation's `beforeRemove` listener on the
 * navigation object from `useNavigation()`; the iOS swipe-back is also switched off while busy, since a native
 * gesture can't always be held back by `beforeRemove`.
 */
function useLeaveGuard(busy: boolean, cancel: () => void) {
  const navigation = useNavigation();
  const busyRef = useRef(busy); busyRef.current = busy;
  const leaving = useRef(false);
  useEffect(() => { navigation.setOptions({ gestureEnabled: !busy }); }, [navigation, busy]);
  useEffect(() => navigation.addListener("beforeRemove", (e) => {
    if (!busyRef.current || leaving.current) return;
    e.preventDefault();
    Alert.alert("Stop posting?", "Uploads in progress will be cancelled.", [
      { text: "Keep Posting", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: () => { leaving.current = true; cancel(); navigation.dispatch(e.data.action); } },
    ]);
  }), [navigation, cancel]);
}
