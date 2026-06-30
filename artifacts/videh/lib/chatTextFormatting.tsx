import React from "react";
import { Text, type TextStyle } from "react-native";
import { splitChatMentionSegments } from "@/lib/groupChatUi";

export type ChatTextSegment =
  | { kind: "plain"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "mention"; value: string };

const BOLD_TOKEN_RE = /\*([^*\n]+)\*/g;

/** Split plain text into normal + *bold* segments (WhatsApp-style). */
export function splitBoldSegments(text: string): { bold: boolean; value: string }[] {
  const out: { bold: boolean; value: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD_TOKEN_RE)) {
    const idx = match.index ?? 0;
    if (idx > last) out.push({ bold: false, value: text.slice(last, idx) });
    out.push({ bold: true, value: match[1] ?? "" });
    last = idx + match[0].length;
  }
  if (last < text.length) out.push({ bold: false, value: text.slice(last) });
  if (out.length === 0) out.push({ bold: false, value: text });
  return out;
}

/** Mentions first, then bold inside non-mention runs. */
export function parseChatTextSegments(
  text: string,
  knownMentionNames: string[] = [],
): ChatTextSegment[] {
  const segments: ChatTextSegment[] = [];
  for (const mentionSeg of splitChatMentionSegments(text, knownMentionNames)) {
    if (mentionSeg.mention) {
      segments.push({ kind: "mention", value: mentionSeg.value });
      continue;
    }
    for (const boldSeg of splitBoldSegments(mentionSeg.value)) {
      if (!boldSeg.value) continue;
      segments.push(
        boldSeg.bold
          ? { kind: "bold", value: boldSeg.value }
          : { kind: "plain", value: boldSeg.value },
      );
    }
  }
  return segments.length ? segments : [{ kind: "plain", value: text }];
}

export type FormattedChatTextOptions = {
  mentionColor?: string;
  foregroundColor?: string;
  baseStyle?: TextStyle;
  boldStyle?: TextStyle;
  knownMentionNames?: string[];
};

export function renderFormattedChatText(
  text: string,
  opts: FormattedChatTextOptions = {},
): React.ReactNode {
  const mentionColor = opts.mentionColor ?? "#1FA855";
  const boldStyle: TextStyle = opts.boldStyle ?? { fontFamily: "Inter_700Bold" };
  const plainColor =
    opts.foregroundColor
    ?? (typeof opts.baseStyle?.color === "string" ? opts.baseStyle.color : undefined);
  const plainStyle: TextStyle | undefined = plainColor ? { color: plainColor } : undefined;
  const segments = parseChatTextSegments(text, opts.knownMentionNames ?? []);
  if (segments.length === 1 && segments[0]!.kind === "plain") {
    return segments[0]!.value;
  }
  return segments.map((seg, i) => {
    if (seg.kind === "mention") {
      return (
        <Text key={i} style={{ color: mentionColor, fontFamily: "Inter_600SemiBold" }}>
          {seg.value}
        </Text>
      );
    }
    if (seg.kind === "bold") {
      return (
        <Text key={i} style={[boldStyle, plainStyle]}>
          {seg.value}
        </Text>
      );
    }
    return (
      <Text key={i} style={plainStyle}>
        {seg.value}
      </Text>
    );
  });
}
