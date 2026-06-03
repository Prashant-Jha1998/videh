/** Prevents double router.back() when call session + call screen both react to hang-up. */
let leavingCallScreen = false;

export function runLeaveCallScreen(navigate: () => void): void {
  if (leavingCallScreen) return;
  leavingCallScreen = true;
  try {
    navigate();
  } catch {
    /* navigation may throw if stack is mid-transition */
  }
  setTimeout(() => {
    leavingCallScreen = false;
  }, 900);
}

export function resetCallNavigationGuard(): void {
  leavingCallScreen = false;
}
