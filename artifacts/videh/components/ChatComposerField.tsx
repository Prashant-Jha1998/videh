import React, { forwardRef } from "react";
import { Platform, TextInput, type TextInputProps, type TextStyle } from "react-native";

type Props = TextInputProps & {
  value: string;
  baseStyle: TextStyle;
  foregroundColor: string;
};

/** Chat composer — plain multiline input (no formatting overlay). */
export const ChatComposerField = forwardRef<TextInput, Props>(function ChatComposerField(
  { value, baseStyle, foregroundColor, style, multiline, scrollEnabled, ...rest },
  ref,
) {
  const isMultiline = multiline !== false;
  return (
    <TextInput
      {...rest}
      ref={ref}
      value={value}
      multiline={isMultiline}
      scrollEnabled={scrollEnabled ?? isMultiline}
      style={[
        baseStyle,
        style,
        { color: foregroundColor },
        Platform.OS === "android"
          ? {
              textAlignVertical: isMultiline ? "top" : "center",
              includeFontPadding: false,
            }
          : null,
      ]}
    />
  );
});
