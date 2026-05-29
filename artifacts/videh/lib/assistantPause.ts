/** Shared flags so Hey Videh wake listening does not fight the chat keyboard or voice setup. */
let keyboardVisible = false;
let chatInputFocused = false;
let voiceEnrollmentActive = false;

export function setAssistantKeyboardVisible(visible: boolean): void {
  keyboardVisible = visible;
}

export function setAssistantChatInputFocused(focused: boolean): void {
  chatInputFocused = focused;
}

export function setAssistantVoiceEnrollmentActive(active: boolean): void {
  voiceEnrollmentActive = active;
}

export function shouldPauseAssistantListening(): boolean {
  return keyboardVisible || chatInputFocused || voiceEnrollmentActive;
}
