import React, { useRef } from "react";
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

type Props = {
  digits: string[];
  onDigitsChange: (next: string[]) => void;
  onComplete?: (code: string) => void;
  editable?: boolean;
  error?: boolean;
  boxStyle?: StyleProp<TextStyle>;
  rowStyle?: StyleProp<ViewStyle>;
  filledBorderColor?: string;
  emptyBorderColor?: string;
  backgroundColor?: string;
  textColor?: string;
  errorBorderColor?: string;
  autoFocus?: boolean;
};

/**
 * 6-box OTP UI with OS SMS autofill:
 * - Android: autoComplete="sms-otp" on a dedicated capture field
 * - iOS: textContentType="oneTimeCode"
 * When the system pastes the full code, boxes fill and onComplete fires.
 */
export function SmsOtpBoxes({
  digits,
  onDigitsChange,
  onComplete,
  editable = true,
  error = false,
  boxStyle,
  rowStyle,
  filledBorderColor = "#128C7E",
  emptyBorderColor = "#ccc",
  backgroundColor = "#fff",
  textColor = "#111",
  errorBorderColor = "#dc2626",
  autoFocus = true,
}: Props) {
  const inputs = useRef<(TextInput | null)[]>([]);
  const autofillRef = useRef<TextInput | null>(null);

  const applyCode = (raw: string, startIndex = 0) => {
    const onlyDigits = raw.replace(/[^0-9]/g, "");
    if (!onlyDigits) return;
    const next = [...digits];
    let write = startIndex;
    for (const ch of onlyDigits) {
      if (write > 5) break;
      next[write] = ch;
      write += 1;
    }
    onDigitsChange(next);
    if (write <= 5) inputs.current[write]?.focus();
    else inputs.current[5]?.blur();
    if (next.every((d) => d !== "") && next.join("").length === 6) {
      onComplete?.(next.join(""));
    }
  };

  const handleBoxChange = (text: string, idx: number) => {
    const onlyDigits = text.replace(/[^0-9]/g, "");
    if (onlyDigits.length > 1) {
      applyCode(onlyDigits, idx);
      return;
    }
    const digit = onlyDigits.slice(-1);
    const next = [...digits];
    next[idx] = digit;
    onDigitsChange(next);
    if (digit && idx < 5) inputs.current[idx + 1]?.focus();
    if (next.every((d) => d !== "")) onComplete?.(next.join(""));
  };

  const handleKeyPress = (key: string, idx: number) => {
    if (key === "Backspace" && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  return (
    <View style={[styles.wrap, rowStyle]}>
      {/* Invisible capture field — OS SMS Autofill / one-time-code targets this */}
      <TextInput
        ref={autofillRef}
        value=""
        onChangeText={(t) => {
          const code = t.replace(/[^0-9]/g, "").slice(0, 6);
          if (code.length >= 4) applyCode(code, 0);
        }}
        style={styles.autofillCapture}
        caretHidden
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        importantForAutofill="yes"
        autoFocus={false}
        editable={editable}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View style={styles.row} pointerEvents="box-none">
        {digits.map((d, idx) => (
          <TextInput
            key={idx}
            ref={(r) => {
              inputs.current[idx] = r;
            }}
            style={[
              styles.box,
              {
                backgroundColor,
                borderColor: error
                  ? errorBorderColor
                  : d
                    ? filledBorderColor
                    : emptyBorderColor,
                color: textColor,
                borderWidth: d ? 2 : 1.5,
              },
              boxStyle,
            ]}
            maxLength={idx === 0 ? 6 : 1}
            keyboardType="number-pad"
            // Only the first visible box also advertises OTP autofill (backup for some OEMs).
            autoComplete={idx === 0 ? (Platform.OS === "android" ? "sms-otp" : "one-time-code") : "off"}
            textContentType={idx === 0 ? "oneTimeCode" : "none"}
            importantForAutofill={idx === 0 ? "yes" : "no"}
            value={d}
            onChangeText={(t) => handleBoxChange(t, idx)}
            onKeyPress={(e) => handleKeyPress(e.nativeEvent.key, idx)}
            autoFocus={autoFocus && idx === 0}
            selectTextOnFocus
            editable={editable}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center", position: "relative" },
  row: { flexDirection: "row", gap: 10 },
  box: {
    width: 48,
    height: 56,
    borderRadius: 12,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  autofillCapture: {
    position: "absolute",
    opacity: 0.02,
    height: 1,
    width: 1,
    zIndex: 2,
  },
});
