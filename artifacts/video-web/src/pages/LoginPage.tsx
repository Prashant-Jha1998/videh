import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { sendOtp, verifyOtp } from "@/lib/reelsApi";
import { navigate } from "@/lib/router";

export function LoginPage({ redirect }: { redirect?: string }) {
  const { setUser } = useAuth();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const goNext = async () => {
    setError("");
    setLoading(true);
    try {
      if (step === "phone") {
        if (!/^\d{10}$/.test(phone)) {
          setError("Enter a valid 10-digit Indian mobile number.");
          return;
        }
        const res = await sendOtp(phone);
        if (!res.success) {
          setError(res.message ?? "Could not send OTP.");
          return;
        }
        setStep("otp");
      } else {
        const res = await verifyOtp(phone, otp);
        if (!res.success || !res.user?.dbId || !res.sessionToken) {
          setError(res.message === "OTP verified" ? "Sign-in failed. Please try again." : (res.message ?? "Invalid OTP."));
          return;
        }
        setUser({
          dbId: res.user.dbId,
          sessionToken: res.sessionToken,
          name: res.user.name,
          phone: res.user.phone ?? phone,
        });
        navigate(redirect && redirect.startsWith("/") ? redirect : "/");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src="/videh_icon_foreground.png" alt="" width={56} height={56} />
        <h1>Sign in to Videh Video</h1>
        <p>Use the same mobile number as your Videh Messenger app.</p>
        {step === "phone" ? (
          <label>
            Mobile number (+91)
            <input
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit number"
            />
          </label>
        ) : (
          <label>
            OTP sent to +91 {phone}
            <input
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit OTP"
            />
          </label>
        )}
        {error ? <p className="error">{error}</p> : null}
        <button type="button" className="btn-primary wide" disabled={loading} onClick={goNext}>
          {loading ? "Please wait…" : step === "phone" ? "Send OTP" : "Verify & sign in"}
        </button>
        {step === "otp" ? (
          <button type="button" className="link-btn" onClick={() => setStep("phone")}>
            Change number
          </button>
        ) : null}
      </div>
    </div>
  );
}
