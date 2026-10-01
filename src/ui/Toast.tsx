import { useEffect } from "react";
import { Text, View } from "react-native";
import { create } from "zustand";
import { theme } from "@/src/theme/theme";

type ToastState = { message: string | null; stamp: number; show: (message: string) => void; clear: () => void };
export const useToast = create<ToastState>((set) => ({
  message: null, stamp: 0,
  show: (message) => set({ message, stamp: Date.now() }),
  clear: () => set({ message: null }),
}));

/** Mount once near the root of a screen. Shows the latest message for 2.5 s. */
export function ToastHost() {
  const { message, stamp, clear } = useToast();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clear, 2500);
    return () => clearTimeout(t);
  }, [message, stamp, clear]);
  if (!message) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: 100, alignItems: "center" }}>
      <View style={{ backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.straw, borderWidth: 1, borderRadius: theme.radius.pill, paddingVertical: 10, paddingHorizontal: 18 }}>
        <Text style={{ color: theme.colors.text }}>{message}</Text>
      </View>
    </View>
  );
}
