import { BadgeCheck, ExternalLink } from "lucide-react";

export function TemplateMessagePreview() {
  return (
    <div
      className="chat-doodle flex flex-col w-full rounded-2xl border border-white/10 overflow-hidden shadow-2xl shadow-black/50"
      style={{ maxHeight: "min(540px, calc(100dvh - 7.5rem))" }}
    >
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-[#202c33] border-b border-white/5">
        <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-[#00a884] to-[#128c7e] flex items-center justify-center text-white font-bold text-sm">
          V
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-white text-sm truncate">Your Brand Pvt Ltd</span>
            <BadgeCheck className="h-4 w-4 text-[#53bdeb] shrink-0" aria-hidden />
          </div>
          <p className="text-[11px] text-[#8696a0]">Business Account</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-2.5">
        <p className="text-center text-[10px] leading-snug text-[#8696a0] bg-[#182229] rounded-lg px-2.5 py-1.5 mx-4 sm:mx-6">
          This business uses a secure service from Videh to manage this chat.
        </p>

        <div className="bg-[#1f2c34] rounded-xl overflow-hidden w-[92%] max-w-[320px] shadow-md">
          <div className="aspect-[16/9] max-h-[120px] w-full bg-gradient-to-br from-[#00a884]/35 to-[#128c7e]/45 flex items-center justify-center border-b border-white/5">
            <div className="text-center px-3">
              <p className="text-white/90 text-[11px] font-medium leading-tight">Header image / product banner</p>
              <p className="text-[#8696a0] text-[9px] mt-0.5">Marketing template · IMAGE</p>
            </div>
          </div>
          <div className="px-3 py-2 space-y-1.5 text-[12px] text-[#e9edef] leading-snug">
            <p>
              <strong>Hello {"{{1}}"}</strong> 👋
            </p>
            <p>
              As a valued customer, get <strong>upto 20% off</strong> on your next order!
            </p>
            <ul className="space-y-0.5 text-[11px] text-[#d1d7db]">
              <li>✅ Instant order updates</li>
              <li>✅ OTP & payment alerts</li>
              <li>✅ Go-live in 7 working days</li>
            </ul>
            <p className="text-[10px] text-[#8696a0] pt-0.5">Ready to get started? Tap below.</p>
          </div>
          <button
            type="button"
            tabIndex={-1}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[#00a884] text-[13px] font-medium border-t border-white/10 bg-[#1a262d]"
          >
            Yes, let&apos;s do it!
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
        </div>

        <p className="text-[9px] text-[#8696a0] text-right pr-1 pb-1">Delivered · 2:37 pm</p>
      </div>

      <div className="shrink-0 px-3 py-2 bg-[#202c33] border-t border-white/5">
        <div className="h-8 rounded-full bg-[#2a3942] px-4 flex items-center text-[#8696a0] text-xs">Type a message</div>
      </div>
    </div>
  );
}
