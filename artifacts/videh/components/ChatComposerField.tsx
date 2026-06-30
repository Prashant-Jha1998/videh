import React, { forwardRef } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from "react-native";
import { renderFormattedChatText } from "@/lib/chatTextFormatting";

type Props = TextInputProps & {
  value: string;
  baseStyle: TextStyle;
  foregroundColor: string;
  mentionColor?: string;
};

/** TextInput with WhatsApp-style live *bold* preview overlay. */
export const ChatComposerField = forwardRef<TextInput, Props>(function ChatComposerField(
  {
    value,
    baseStyle,
    foregroundColor,
    mentionColor,
    style,
    ...rest
  },
  ref,
) {
  const hasText = Boolean(value);
  const fieldStyle = StyleSheet.flatten([baseStyle, style]);
  return (
    <View style={styles.wrap}>
      {hasText ? (
        <Text
          style={[fieldStyle, styles.overlay]}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {renderFormattedChatText(value, { mentionColor, baseStyle: fieldStyle })}
        </Text>
      ) : null}
      <TextInput
        {...rest}
        ref={ref}
        value={value}
        style={[
          fieldStyle,
          hasText ? styles.transparentInput : null,
          { color: hasText ? "transparent" : foregroundColor },
        ]}
        selectionColor={foregroundColor}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    ...(Platform.OS === "android" ? { textAlignVertical: "center" as const } : {}),
  },
  transparentInput: {
    backgroundColor: "transparent",
  },
});
