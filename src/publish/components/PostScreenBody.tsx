import { router, useNavigation } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, ScrollView, TextInput, View } from "react-native";
import { formatBytes } from "@/src/export/estimate";
import { useEditorStore } from "@/src/editor/store";
import { nowIso } from "@/src/lib/clock";
import { formatDuration } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { IconButton } from "@/src/ui/IconButton";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Screen } from "@/src/ui/Screen";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Body, Title } from "@/src/ui/Text";
import { ToastHost, useToast } from "@/src/ui/Toast";
import { PLATFORMS, type PlatformId } from "../platforms";
import { useAccounts } from "../useAccounts";
import { usePost } from "../usePost";
import type { PostTarget } from "../postParams";
import { usePostForm } from "../usePostForm";
import { useSession } from "../useSession";
import { PostOptionsSheet } from "./PostOptionsSheet";
import { PostRow } from "./PostRow";
import { cardStyle, SignInCard } from "./SignInCard";

/** Same look as the editor's text fields (TextPanel / NumField). */
const field = { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, borderRadius: theme.radius.chip, fontFamily: theme.fonts.body, padding: 10, fontSize: 16 } as const;
const small = { fontSize: 12 } as const;
const goBack =() => (router.canGoBack() ? router.back() : router.replace("/"));

export function PostScreenBody({ target: { video, projectId, title } }: { target: PostTarget }) {
  const session = useSession();
  const signedIn = session.status === "signedIn";
  const accounts = useAccounts(signedIn);

  const onPosted = useCallback((platform: PlatformId, url: string | null) => {
    haptic("success");
    const store = useEditorStore.getState();
    if (projectId && store.project?.id === projectId) store.addPostRecord({ platform, url, postedAt: nowIso() });
  }, [projectId]);
  const { rows, busy, start, retry, cancel } = usePost(video, onPosted);
  const form = usePostForm(video, accounts.platforms, title, rows, accounts.refresh);
  const [optionsFor, setOptionsFor] = useState<PlatformId | null>(null);
  useLeaveGuard(busy, cancel);

  const onPost = () => { haptic("light"); start(form.jobs); };
  async function onShare() {
    try { await Sharing.shareAsync(video.fileUri, { mimeType: video.mimeType, UTI: video.mimeType === "video/quicktime" ? "com.apple.quicktime-movie" : "public.mpeg-4" }); }
    catch (e) { useToast.getState().show(e instanceof Error ? e.message : "Could not share the video."); }
  }
  const openUrl = (url: string) => { Linking.openURL(url).catch(() => useToast.getState().show("Couldn't open the link.")); };
  const spinner = <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.space.xl }} />;

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.xs, paddingHorizontal: theme.space.sm }}>
        <IconButton name="chevron-back" accessibilityLabel="Back" onPress={goBack} />
        <Title size={26} accessibilityRole="header">Post</Title>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.lg }}>
          <Body muted>{`${formatDuration(video.durationSec)} · ${formatBytes(video.fileSize)}`}</Body>
          {session.status === "loading" ? spinner : null}
          <SignInCard />
          {!signedIn ? null : (<>
            <View style={{ gap: theme.space.xs }}>
              <TextInput accessibilityLabel="Caption" multiline value={form.caption} onChangeText={form.setCaption} placeholder="Write a caption…"
                placeholderTextColor={theme.colors.textMuted} style={{ ...field, minHeight: 96, textAlignVertical: "top" }} />
              {form.captionMax !== null ? (
                <Body muted style={[small, { alignSelf: "flex-end" }, form.overLimit ? { color: theme.colors.danger } : null]}>{`${form.caption.length} / ${form.captionMax}`}</Body>
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
              <View style={[cardStyle, { gap: theme.space.md, alignItems: "flex-start" }]}>
                <Body>{accounts.error ?? "Something went wrong."}</Body>
                <SecondaryButton title="Try again" onPress={accounts.refresh} />
              </View>
            ) : accounts.status !== "ready" ? spinner : (
              <View style={[cardStyle, { paddingVertical: theme.space.xs }]}>
                {form.views.map((v, i) => (
                  <View key={v.status.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.hairline } : undefined}>
                    <PostRow view={v} row={rows[v.status.id]} onToggle={() => form.toggle(v.status.id)} onOptions={() => setOptionsFor(v.status.id)}
                      onConnect={() => router.push("/accounts")}
                      onReconnect={() => { form.markReconnect(v.status.id); router.push("/accounts"); }}
                      onRetry={() => { const job = form.retryJob(v); if (job) retry(job); }} onView={openUrl} />
                  </View>
                ))}
              </View>
            )}
          </>)}
        </ScrollView>
        <View style={{ paddingHorizontal: theme.space.lg, paddingTop: theme.space.md, gap: theme.space.md }}>
          {signedIn ? <PrimaryButton title="Post" onPress={onPost} disabled={busy || form.jobs.length === 0} /> : null}
          <SecondaryButton title="Share…" onPress={onShare} />
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
      { text: "Keep posting", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: () => { leaving.current = true; cancel(); navigation.dispatch(e.data.action); } },
    ]);
  }), [navigation, cancel]);
}
