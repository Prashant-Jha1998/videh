import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";

/**
 * Keyboard visibility/height for chat composer.
 * Uses keyboard-controller when native module is linked; falls back to RN Keyboard events.
 */
export function useChatKeyboard() {
  const controllerVisible = useKeyboardState((s) => s.isVisible);
  const controllerHeight = useKeyboardState((s) => s.height);

  const [fallbackHeight, setFallbackHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: { endCoordinates?: { height?: number } }) => {
      setFallbackHeight(e.endCoordinates?.height ?? 0);
    };
    const onHide = () => setFallbackHeight(0);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const keyboardHeight = Math.max(controllerHeight, fallbackHeight);
  const keyboardVisible = controllerVisible || keyboardHeight > 0;

  return { keyboardVisible, keyboardHeight };
}
