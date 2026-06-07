import { useCallback, useMemo, useState } from "react";
import { Loader2, Lock, Mail, User } from "lucide-react";
import { devFetch } from "../lib/devFetch";
import { isPasswordValid } from "../lib/passwordPolicy";
import { PasswordRequirements } from "./PasswordRequirements";
import { GoogleSignInButton } from "./GoogleSignInButton";

export type AuthMode = "login" | "signup" | "forgot" | "reset";

type Props = {
  mode: AuthMode;
  onClose: () => void;
  onSuccess: () => void;
  onSwitchMode: (mode: AuthMode) => void;
};

export function DeveloperAuth({ mode, onClose, onSuccess, onSwitchMode }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);

  const title = useMemo(() => {
    if (mode === "signup") return "Create developer account";
    if (mode === "forgot") return "Forgot password";
    if (mode === "reset") return "Reset password";
    return "Sign in";
  }, [mode]);

  const finishGoogle = useCallback(
    async (credential: string) => {
      setBusy(true);
      setError("");
      try {
        const r = await devFetch("/api/developer-auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential }),
        });
        const d = (await r.json()) as { success?: boolean; message?: string };
        if (!r.ok || !d.success) throw new Error(d.message ?? "Google sign-in failed");
        onSuccess();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Google sign-in failed");
      } finally {
        setBusy(false);
      }
    },
    [onSuccess],
  );

  const submit = async () => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (mode === "signup") {
        if (!isPasswordValid(password)) {
          setError("Password does not meet all requirements below.");
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }
        const r = await devFetch("/api/developer-auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, confirmPassword, fullName }),
        });
        const d = (await r.json()) as { success?: boolean; message?: string };
        if (!r.ok || !d.success) throw new Error(d.message ?? "Registration failed");
        onSuccess();
        return;
      }

      if (mode === "login") {
        const r = await devFetch("/api/developer-auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const d = (await r.json()) as { success?: boolean; message?: string };
        if (!r.ok || !d.success) throw new Error(d.message ?? "Sign in failed");
        onSuccess();
        return;
      }

      if (mode === "forgot") {
        const r = await devFetch("/api/developer-auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const d = (await r.json()) as { success?: boolean; message?: string; devOtp?: string };
        if (!r.ok || !d.success) throw new Error(d.message ?? "Request failed");
        setInfo(d.message ?? "If an account exists, we sent a reset code.");
        if (d.devOtp) setDevOtpHint(d.devOtp);
        onSwitchMode("reset");
        return;
      }

      if (mode === "reset") {
        if (!isPasswordValid(password)) {
          setError("Password does not meet all requirements below.");
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }
        const r = await devFetch("/api/developer-auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp, password, confirmPassword }),
        });
        const d = (await r.json()) as { success?: boolean; message?: string };
        if (!r.ok || !d.success) throw new Error(d.message ?? "Reset failed");
        setInfo(d.message ?? "Password updated. Sign in now.");
        onSwitchMode("login");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const showPasswordFields = mode === "signup" || mode === "login" || mode === "reset";
  const showConfirm = mode === "signup" || mode === "reset";
  const showGoogle = mode === "login" || mode === "signup";
  const inputClass =
    "w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-3 text-sm text-[#111b21] placeholder:text-[#8696a0] focus:outline-none focus:ring-2 focus:ring-[#00a884]/35 focus:border-[#00a884]";

  return (
    <div className="fixed inset-0 z-[60] bg-[#0b141a]/92 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200/80 p-6 md:p-8 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="flex justify-between items-start gap-3 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <img src="/videh_icon_foreground.png" alt="" className="h-8 w-8 rounded-lg" />
              <span className="text-xs font-semibold uppercase tracking-wide text-[#00a884]">Videh Business API</span>
            </div>
            <h2 className="text-2xl font-bold text-[#111b21]">{title}</h2>
            <p className="text-sm text-[#667781] mt-1 leading-relaxed">
              {mode === "signup"
                ? "Create your account before applying for the Business API."
                : mode === "login"
                  ? "Sign in to continue your application or open the developer console."
                  : mode === "forgot"
                    ? "We will send a 6-digit code to reset your password."
                    : "Enter the code and choose a new password."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#667781] hover:text-[#111b21] text-sm font-medium shrink-0 px-2 py-1 rounded-lg hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        {error ? (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        ) : null}
        {info ? (
          <p className="mb-4 text-sm text-[#00a884] bg-[#00a884]/10 border border-[#00a884]/20 rounded-lg px-3 py-2">{info}</p>
        ) : null}
        {devOtpHint ? (
          <p className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Dev reset code: <strong className="font-mono">{devOtpHint}</strong>
          </p>
        ) : null}

        {showGoogle ? (
          <div className="mb-5">
            <GoogleSignInButton mode={mode} disabled={busy} onCredential={finishGoogle} />
            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-medium text-[#667781] uppercase tracking-wide">or use email</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          {mode === "signup" ? (
            <label className="block">
              <span className="text-xs font-medium text-[#667781]">Full name (optional)</span>
              <div className="relative mt-1.5">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#667781]" />
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
            </label>
          ) : null}

          <label className="block">
            <span className="text-xs font-medium text-[#667781]">Email *</span>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#667781]" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@company.com"
              />
            </div>
          </label>

          {mode === "reset" ? (
            <label className="block">
              <span className="text-xs font-medium text-[#667781]">6-digit reset code *</span>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full mt-1.5 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#00a884]/35 focus:border-[#00a884]"
                placeholder="000000"
                inputMode="numeric"
              />
            </label>
          ) : null}

          {showPasswordFields ? (
            <label className="block">
              <span className="text-xs font-medium text-[#667781]">{mode === "reset" ? "New password *" : "Password *"}</span>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#667781]" />
                <input
                  type="password"
                  autoComplete={mode === "signup" || mode === "reset" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
            </label>
          ) : null}

          {showConfirm ? (
            <label className="block">
              <span className="text-xs font-medium text-[#667781]">Confirm password *</span>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#667781]" />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
            </label>
          ) : null}

          {mode === "signup" || mode === "reset" ? <PasswordRequirements password={password} /> : null}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="mt-6 w-full bg-[#00a884] hover:bg-[#008f6f] text-white font-semibold py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "signup" ? "Create account" : mode === "login" ? "Sign in" : mode === "forgot" ? "Send reset code" : "Update password"}
        </button>

        <div className="mt-4 text-center text-sm text-[#667781] space-y-2">
          {mode === "login" ? (
            <>
              <button type="button" className="text-[#00a884] font-semibold hover:underline" onClick={() => onSwitchMode("forgot")}>
                Forgot password?
              </button>
              <p>
                New here?{" "}
                <button type="button" className="text-[#00a884] font-semibold hover:underline" onClick={() => onSwitchMode("signup")}>
                  Create account
                </button>
              </p>
            </>
          ) : null}
          {mode === "signup" ? (
            <p>
              Already have an account?{" "}
              <button type="button" className="text-[#00a884] font-semibold hover:underline" onClick={() => onSwitchMode("login")}>
                Sign in
              </button>
            </p>
          ) : null}
          {mode === "forgot" || mode === "reset" ? (
            <button type="button" className="text-[#00a884] font-semibold hover:underline" onClick={() => onSwitchMode("login")}>
              Back to sign in
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
