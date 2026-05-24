/** Shared flags so Hey Videh wake listening does not fight the chat keyboard. */
let keyboardVisible = false;
let chatInputFocused = false;

export function setAssistantKeyboardVisible(visible: boolean): void {
  keyboardVisible = visible;
}

export function setAssistantChatInputFocused(focused: boolean): void {
  chatInputFocused = focused;
}

export function shouldPauseAssistantListening(): boolean {
  return keyboardVisible || chatInputFocused;
}
