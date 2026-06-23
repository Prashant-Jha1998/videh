import React, { useMemo, useState } from "react";
import { Platform, Text, type TextStyle } from "react-native";
import {
  getCollapsedChatMessagePreview,
  shouldCollapseChatMessage,
} from "@/lib/chatMessageText";

type Props = {
  text: string;
  style?: TextStyle | TextStyle[];
  linkColor?: string;
};

type CompactProps = {
  text: string;
  time: string;
  isMe: boolean;
  status?: string;
  isEdited?: boolean;
  style?: TextStyle | TextStyle[];
  timeColor: string;
  linkColor?: string;
};

const ANDROID_TEXT_METRICS: TextStyle = Platform.OS === "android"
  ? { includeFontPadding: false, textAlignVertical: "center" }
  : {};

function renderMentionParts(text: string, linkColor = "#00A884") {
  const parts = text.split(/(@\w[\w\s]*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    /^@\w/.test(part) ? (
      <Text key={i} style={{ color: linkColor, fontFamily: "Inter_600SemiBold" }}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

function tickSuffix(isMe: boolean, status?: string): { ticks: string; tickColor?: string } {
  if (!isMe) return { ticks: "" };
  if (status === "read") return { ticks: " ✓✓", tickColor: "#53BDEB" };
  if (status === "delivered") return { ticks: " ✓✓" };
  return { ticks: " ✓" };
}

/**
 * Short chat bubbles — time sits on the last text line (WhatsApp-style) so it
 * stays inside the bubble on every screen width / font scale.
 */
export function ChatCompactMessageText({
  text,
  time,
  isMe,
  status,
  isEdited,
  style,
  timeColor,
  linkColor = "#027EB5",
}: CompactProps) {
  const { ticks, tickColor } = tickSuffix(isMe, status);
  const editedPart = isEdited ? "edited " : "";
  const reserve = `${editedPart}${time}${ticks}`;
  const timeStyle: TextStyle = {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Inter_400Regular",
    color: timeColor,
    ...ANDROID_TEXT_METRICS,
  };

  return (
    <Text style={[style, ANDROID_TEXT_METRICS]}>
      {renderMentionParts(text, linkColor)}
      <Text style={[timeStyle, { color: "transparent" }]} accessible={false} importantForAccessibility="no">
        {" "}
        {reserve}
      </Text>
      {isEdited ? (
        <Text style={[timeStyle, { fontSize: 10, fontStyle: "italic" }]}>edited </Text>
      ) : null}
      <Text style={timeStyle}>
        {" "}
        {time}
        {ticks ? <Text style={{ color: tickColor ?? timeColor }}>{ticks}</Text> : null}
      </Text>
    </Text>
  );
}

/** WhatsApp-style long message text with @mentions and Read more / Read less. */
export function ChatMessageText({ text, style, linkColor = "#027EB5" }: Props) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = useMemo(() => shouldCollapseChatMessage(text), [text]);
  const preview = useMemo(() => getCollapsedChatMessagePreview(text), [text]);

  const linkStyle: TextStyle = {
    color: linkColor,
    fontFamily: "Inter_600SemiBold",
  };

  if (!collapsible || expanded) {
    return (
      <Text style={[style, ANDROID_TEXT_METRICS]}>
        {renderMentionParts(text, linkColor)}
        {collapsible && expanded ? (
          <Text style={linkStyle} onPress={() => setExpanded(false)}>
            {" "}
            Read less
          </Text>
        ) : null}
      </Text>
    );
  }

  return (
    <Text style={[style, ANDROID_TEXT_METRICS]}>
      {renderMentionParts(preview, linkColor)}
      <Text style={linkStyle} onPress={() => setExpanded(true)}>
        {" "}
        Read more
      </Text>
    </Text>
  );
}
