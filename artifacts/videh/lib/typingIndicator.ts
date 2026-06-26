/** Human-readable typing line for chat header / list (Videh). */
export function formatTypingLabel(names: string[], isGroup?: boolean): string {
  if (!names.length) return "";
  if (!isGroup) return "typing…";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]} and ${names.length - 1} others are typing…`;
}
