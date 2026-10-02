import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, View, type DimensionValue } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/src/theme/theme";
import { Body, Title } from "./Text";
import { useReducedMotion } from "./useReducedMotion";

type Props = {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode; height?: DimensionValue; action?: { label: string; onPress: () => void };
  /** Lift the panel above the keyboard (sheets with text fields). */
  avoidKeyboard?: boolean;
};

/** Close when dragged past 25 % of the panel or flicked down fast. */
export function shouldDismiss(translationY: number, velocityY: number, height: number): boolean {
  return translationY > 0 && (translationY > height * 0.25 || velocityY > 800);
}

const START_OFFSET = 320;

/** Animation that brings the panel to rest: spring normally, plain timing (no spring) under Reduce Motion. */
export function settle(reduced: boolean) {
  return reduced ? withTiming(0, { duration: theme.motion.fade }) : withSpring(0, theme.motion.sheet);
}

export function Sheet({ visible, onClose, title, children, height, action, avoidKeyboard }: Props) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(START_OFFSET);
  const [panelH, setPanelH] = useState(400);

  useEffect(() => {
    if (!visible) { y.value = START_OFFSET; return; }
    y.value = settle(reduced);
  }, [visible, reduced, y]);

  // runOnJS(true): callbacks run on the JS thread, so onClose needs no worklet bridge.
  const pan = Gesture.Pan().runOnJS(true)
    .onUpdate((e) => { y.value = Math.max(0, e.translationY); })
    .onEnd((e) => { if (shouldDismiss(e.translationY, e.velocityY, panelH)) onClose(); else y.value = settle(reduced); });
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* A Modal is a separate native root: give its gestures their own root view. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" enabled={!!avoidKeyboard}>
          <Pressable style={{ flex: 1, backgroundColor: theme.colors.scrim }} onPress={onClose} accessibilityLabel="Close sheet" />
          <Animated.View onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
            style={[{ backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.sheet, borderTopRightRadius: theme.radius.sheet,
              borderTopWidth: 1, borderColor: theme.colors.hairline, paddingHorizontal: theme.space.xl, paddingBottom: insets.bottom + theme.space.lg, gap: theme.space.lg, maxHeight: height }, anim]}>
            <GestureDetector gesture={pan}>
              <View style={{ paddingTop: theme.space.sm, gap: theme.space.md }}>
                <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.textMuted, opacity: 0.5 }} />
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Title size={18} accessibilityRole="header">{title}</Title>
                  {action ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} hitSlop={8}>
                      <Body weight="semi" style={{ color: theme.colors.accent, fontSize: 13 }}>{action.label}</Body>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </GestureDetector>
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}
