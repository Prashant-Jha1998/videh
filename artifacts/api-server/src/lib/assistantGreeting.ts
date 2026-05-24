export function timeGreetingHindi(now = new Date()): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return "सुप्रभात";
  if (hour >= 12 && hour < 17) return "नमस्कार";
  if (hour >= 17 && hour < 21) return "शुभ संध्या";
  return "शुभ रात्रि";
}

export function timeGreetingEnglish(now = new Date()): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

export function buildActivationGreeting(userName: string, locale: "hi" | "en" = "hi"): string {
  const cleaned = (userName ?? "").trim();
  const first = cleaned.split(/\s+/)[0] || cleaned || "User";
  if (locale === "en") {
    return `${timeGreetingEnglish()}, ${first}. Videh is at your service. Tell me what you need.`;
  }
  return `${timeGreetingHindi()}, ${first} ji. Videh aapki seva mein hazir hai. Jo aap bolenge, main wahi karunga.`;
}
