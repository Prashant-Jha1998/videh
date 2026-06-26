import { CheckCircle2, Circle } from "lucide-react";
import { passwordChecks } from "../lib/passwordPolicy";

type Props = { password: string; className?: string };

export function PasswordRequirements({ password, className = "" }: Props) {
  const checks = passwordChecks(password);
  return (
    <div className={`rounded-xl border border-gray-200 bg-[#fafafa] p-3 text-xs ${className}`}>
      <p className="font-semibold text-[#14131F] mb-2">Password must include:</p>
      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li key={c.id} className={`flex items-start gap-2 ${c.ok ? "text-[#5B4FE8]" : "text-[#667781]"}`}>
            {c.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-50" />
            )}
            <span>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
