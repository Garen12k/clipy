import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, View, type DimensionValue } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/src/theme/theme";
import { sheetTo } from "./motion";
import { QuietButton } from "./QuietButton";
import { Title } from "./Text";
import { isReducedMotion } from "./useReducedMotion";

type Props = {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode; height?: DimensionValue; action?: { label: string; onPress: () => void };
  /** Lift the panel above the keyboard (sheets with text fields). */
  avoidKeyboard?: boolean;
};

/** Close when dragged past 25 % of the panel or flicked down fast. */
export function shouldDismiss(translationY: number, velocityY: number, height: number): boolean {
  return translationY > 0 && (translationY > height * 0.25 || velocityY > 800);
}

/** Where the panel starts from, below its resting place. */
const START_OFFSET = 320;
const GRABBER = { width: 36, height: 4 } as const;

/**
 * A pop-up panel over a dimmed screen (a Modal). It rises into place on the sheet spring from motion.ts - critically damped, so it
 * does not bounce - and springs back the same way when a drag does not close it. With Reduce Motion it is placed at once (the Modal's
 * own cross-fade is all that moves). Closing is the Modal's fade.
 */
export function Sheet({ visible, onClose, title, children, height, action, avoidKeyboard }: Props) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(START_OFFSET);
  const [panelH, setPanelH] = useState(400);

  // Only `visible` starts it. The shared value is deliberately not a dependency: it is stable on the device, but the Jest mock hands out a new one on every render.
  useEffect(() => { y.value = visible ? sheetTo(isReducedMotion()) : START_OFFSET; }, [visible]);

  // runOnJS(true): callbacks run on the JS thread, so onClose needs no worklet bridge.
  const pan = Gesture.Pan().runOnJS(true)
    .onUpdate((e) => { y.value = Math.max(0, e.translationY); })
    .onEnd((e) => { if (shouldDismiss(e.translationY, e.velocityY, panelH)) onClose(); else y.value = sheetTo(isReducedMotion()); });
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* A Modal is a separate native root: give its gestures their own root view. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" enabled={!!avoidKeyboard}>
          <Pressable style={{ flex: 1, backgroundColor: theme.colors.scrim }} onPress={onClose} accessibilityLabel="Close sheet" />
          <Animated.View testID="sheet-panel" onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
            style={[{ backgroundColor: theme.elevation.bar, borderTopLeftRadius: theme.radius.sheet, borderTopRightRadius: theme.radius.sheet,
              borderTopWidth: 1, borderColor: theme.colors.hairline, paddingHorizontal: theme.space.xl, paddingBottom: insets.bottom + theme.space.lg, gap: theme.space.lg, maxHeight: height }, anim]}>
            <GestureDetector gesture={pan}>
              <View testID="sheet-header" style={{ paddingTop: theme.space.sm, gap: theme.space.md }}>
                <View style={{ alignSelf: "center", width: GRABBER.width, height: GRABBER.height, borderRadius: theme.radius.pill, backgroundColor: theme.colors.textMuted, opacity: 0.5 }} />
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Title size={theme.type.heading} accessibilityRole="header">{title}</Title>
                  {action ? <QuietButton compact title={action.label} onPress={action.onPress} /> : null}
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
