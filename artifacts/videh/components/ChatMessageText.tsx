import React, { useMemo, useState } from "react";
import { Text, type TextStyle } from "react-native";
import {
  getCollapsedChatMessagePreview,
  shouldCollapseChatMessage,
} from "@/lib/chatMessageText";
import { renderFormattedChatText } from "@/lib/chatTextFormatting";

type Props = {
  text: string;
  style?: TextStyle | TextStyle[];
  linkColor?: string;
  mentionColor?: string;
};

export function renderChatMentionParts(text: string, mentionColor = "#5B4FE8") {
  const rendered = renderFormattedChatText(text, { mentionColor });
  if (typeof rendered === "string") return rendered;
  return rendered;
}

/** Videh long message text with @mentions and Read more / Read less. */
export function ChatMessageText({ text, style, linkColor = "#027EB5", mentionColor }: Props) {
  const resolvedMentionColor = mentionColor ?? "#1FA855";
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
        {renderChatMentionParts(text, resolvedMentionColor)}
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
      {renderChatMentionParts(preview, resolvedMentionColor)}
      <Text style={linkStyle} onPress={() => setExpanded(true)}>
        {" "}
        Read more
      </Text>
    </Text>
  );
}
