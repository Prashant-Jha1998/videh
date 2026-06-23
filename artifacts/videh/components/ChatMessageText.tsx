import React, { useMemo, useState } from "react";
import { Text, type TextStyle } from "react-native";
import {
  getCollapsedChatMessagePreview,
  shouldCollapseChatMessage,
} from "@/lib/chatMessageText";

type Props = {
  text: string;
  style?: TextStyle | TextStyle[];
  linkColor?: string;
};

function renderMentionParts(text: string) {
  const parts = text.split(/(@\w[\w\s]*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    /^@\w/.test(part) ? (
      <Text key={i} style={{ color: "#00A884", fontFamily: "Inter_600SemiBold" }}>
        {part}
      </Text>
    ) : (
      part
    ),
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
      <Text style={style}>
        {renderMentionParts(text)}
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
    <Text style={style}>
      {renderMentionParts(preview)}
      <Text style={linkStyle} onPress={() => setExpanded(true)}>
        {" "}
        Read more
      </Text>
    </Text>
  );
}
