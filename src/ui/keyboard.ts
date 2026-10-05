import { useEffect } from "react";
import { Keyboard, type KeyboardEvent } from "react-native";
import { create } from "zustand";

/** The on-screen keyboard's height in points, as iOS last announced it (0 = hidden). */
export const useKeyboard = create<{ height: number }>(() => ({ height: 0 }));

const set = (height: number) => { if (useKeyboard.getState().height !== height) useKeyboard.setState({ height }); };

/**
 * Call once, in the editor's layout. iOS posts keyboardWillShow when the keyboard appears and again whenever its frame changes
 * (another keyboard, the suggestions bar), and keyboardWillHide when it leaves: the layout changes as the keyboard starts to move.
 * keyboardDidHide is followed too: a mount while the keyboard is on its way out starts from the height it still had.
 */
export function useKeyboardTracking(): void {
  useEffect(() => {
    set(Keyboard.metrics()?.height ?? 0);
    const show = Keyboard.addListener("keyboardWillShow", (e: KeyboardEvent) => set(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardWillHide", () => set(0));
    const hidden = Keyboard.addListener("keyboardDidHide", () => set(0));
    return () => { show.remove(); hide.remove(); hidden.remove(); set(0); };
  }, []);
}
