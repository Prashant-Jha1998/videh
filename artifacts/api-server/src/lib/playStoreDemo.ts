/**
 * Google Play review / internal QA login — fixed phone + OTP (no SMS).
 *
 * Enable on API server:
 *   PLAY_STORE_DEMO_ENABLED=1
 *   PLAY_STORE_DEMO_PHONE=9999999999   (optional, default below)
 *   PLAY_STORE_DEMO_OTP=123456         (optional, default below)
 *
 * Play Console → App content → App access → add instructions with these credentials.
 */

const DEFAULT_DEMO_PHONE = "9999999999";
const DEFAULT_DEMO_OTP = "123456";

function normalize10(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return null;
}

export function isPlayStoreDemoEnabled(): boolean {
  const flag = process.env["PLAY_STORE_DEMO_ENABLED"];
  return flag === "1" || flag === "true" || flag === "yes";
}

export function playStoreDemoPhone10(): string | null {
  if (!isPlayStoreDemoEnabled()) return null;
  const raw = (process.env["PLAY_STORE_DEMO_PHONE"] ?? DEFAULT_DEMO_PHONE).trim();
  return normalize10(raw);
}

export function playStoreDemoOtp(): string | null {
  if (!isPlayStoreDemoEnabled()) return null;
  const otp = (process.env["PLAY_STORE_DEMO_OTP"] ?? DEFAULT_DEMO_OTP).trim();
  return /^\d{6}$/.test(otp) ? otp : DEFAULT_DEMO_OTP;
}

export function isPlayStoreDemoPhone(phoneRaw: string): boolean {
  const demo = playStoreDemoPhone10();
  const phone = normalize10(phoneRaw);
  return !!demo && !!phone && demo === phone;
}

export function playStoreDemoOtpMatches(attempt: string): boolean {
  const demo = playStoreDemoOtp();
  if (!demo) return false;
  return demo === String(attempt).trim();
}

/** For Play Console / README — never log the OTP in production. */
export function playStoreDemoCredentialsForDocs(): { phone10: string; phoneE164: string; otp: string } | null {
  if (!isPlayStoreDemoEnabled()) return null;
  const phone10 = playStoreDemoPhone10()!;
  const otp = playStoreDemoOtp()!;
  return { phone10, phoneE164: `+91${phone10}`, otp };
}
