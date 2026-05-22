export type PasswordCheck = { id: string; label: string; ok: boolean };

export const PASSWORD_MIN_LENGTH = 10;

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { id: "lower", label: "One lowercase letter (a–z)", ok: /[a-z]/.test(password) },
    { id: "upper", label: "One uppercase letter (A–Z)", ok: /[A-Z]/.test(password) },
    { id: "digit", label: "One number (0–9)", ok: /\d/.test(password) },
    { id: "special", label: "One special character (!@#$%^&* etc.)", ok: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function validateDeveloperPassword(password: string): { ok: boolean; message?: string } {
  const checks = passwordChecks(password);
  const failed = checks.find((c) => !c.ok);
  if (failed) {
    return { ok: false, message: `Password does not meet requirements: ${failed.label}` };
  }
  return { ok: true };
}
