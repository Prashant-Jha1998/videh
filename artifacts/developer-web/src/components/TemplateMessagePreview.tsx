import { BadgeCheck, ExternalLink } from "lucide-react";

export function TemplateMessagePreview() {
  return (
    <div className="chat-doodle rounded-2xl border border-white/10 overflow-hidden shadow-2xl shadow-black/40 max-w-md mx-auto w-full">
      <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] border-b border-white/5">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#00a884] to-[#128c7e] flex items-center justify-center text-white font-bold text-sm">
          V
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-white text-sm truncate">Your Brand Pvt Ltd</span>
            <BadgeCheck className="h-4 w-4 text-[#53bdeb] shrink-0" />
          </div>
          <p className="text-[11px] text-[#8696a0]">Business Account</p>
        </div>
      </div>

      <div className="px-3 py-4 space-y-3 min-h-[380px]">
        <p className="text-center text-[11px] text-[#8696a0] bg-[#182229] rounded-lg px-3 py-1.5 mx-8">
          This business uses a secure service from Meta to manage this chat.
        </p>

        <div className="bg-[#1f2c34] rounded-lg overflow-hidden max-w-[92%] shadow-md">
          <div className="h-28 bg-gradient-to-br from-[#00a884]/30 to-[#128c7e]/40 flex items-center justify-center border-b border-white/5">
            <div className="text-center px-4">
              <p className="text-white/90 text-xs font-medium">Header image / product banner</p>
              <p className="text-[#8696a0] text-[10px] mt-1">Marketing template · IMAGE</p>
            </div>
          </div>
          <div className="px-3 py-2.5 space-y-2 text-[13px] text-[#e9edef] leading-relaxed">
            <p>
              <strong>Hello {"{{1}}"}</strong> 👋
            </p>
            <p>
              As a valued customer, get <strong>upto 20% off</strong> on your next order!
            </p>
            <ul className="space-y-1 text-[12px] text-[#d1d7db]">
              <li>✅ Instant order updates</li>
              <li>✅ OTP & payment alerts</li>
              <li>✅ Go-live in 7 working days</li>
            </ul>
            <p className="text-[12px] text-[#8696a0]">Ready to get started? Tap below.</p>
          </div>
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 py-2.5 text-[#00a884] text-sm font-medium border-t border-white/10 hover:bg-white/5 transition-colors"
          >
            Yes, let&apos;s do it!
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="text-[10px] text-[#8696a0] text-right pr-1">Delivered · 2:37 pm</p>
      </div>

      <div className="px-3 py-2 bg-[#202c33] border-t border-white/5 flex items-center gap-2">
        <div className="h-9 flex-1 rounded-full bg-[#2a3942] px-4 flex items-center text-[#8696a0] text-sm">
          Type a message
        </div>
      </div>
    </div>
  );
}
