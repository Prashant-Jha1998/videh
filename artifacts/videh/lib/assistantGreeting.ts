function timeGreetingHindi(now = new Date()): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return "सुप्रभात";
  if (hour >= 12 && hour < 17) return "नमस्कार";
  if (hour >= 17 && hour < 21) return "शुभ संध्या";
  return "शुभ रात्रि";
}

export function localActivationGreeting(userName?: string | null, locale: "hi" | "en" = "hi"): string {
  const cleaned = (userName ?? "").trim();
  const first = cleaned.split(/\s+/)[0] || cleaned || "User";
  if (locale === "en") {
    const hour = new Date().getHours();
    const en =
      hour >= 5 && hour < 12 ? "Good morning"
      : hour >= 12 && hour < 17 ? "Good afternoon"
      : hour >= 17 && hour < 21 ? "Good evening"
      : "Good night";
    return `${en}, ${first}. Videh is at your service. Tell me what you need.`;
  }
  return `${timeGreetingHindi()}, ${first} ji. Videh aapki seva mein hazir hai. Jo aap bolenge, main wahi karunga.`;
}
