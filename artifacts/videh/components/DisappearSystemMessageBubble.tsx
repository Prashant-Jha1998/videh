import React from "react";
import { ChatSystemMessageBubble } from "@/components/ChatSystemMessageBubble";

type Props = {
  text: string;
  isDark?: boolean;
  viewerUserId?: number;
  onChangeTimer?: () => void;
};

/** @deprecated use ChatSystemMessageBubble */
export function DisappearSystemMessageBubble(props: Props) {
  return <ChatSystemMessageBubble {...props} />;
}
