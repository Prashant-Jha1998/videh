import type { ReactNode } from "react";
import { CheckCircle2, HelpCircle, Lock, X, type LucideIcon } from "lucide-react";

export type ConsoleModule = {
  id: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  section: "setup" | "review" | "workspace";
};

type ModuleStatus = "current" | "done" | "available" | "locked";

type Props = {
  reference: string;
  currentModule: ConsoleModule;
  modules: ConsoleModule[];
  step: string;
  canGoTo: (id: string) => boolean;
  moduleStatus: (mod: ConsoleModule) => ModuleStatus;
  onGoTo: (id: string) => void;
  onClose: () => void;
  progressSteps: string[];
  stepIndex: number;
  /** Application submitted — hide setup modules and onboarding progress bar */
  submitted?: boolean;
  /** Use full main area width (workspace modules with tables) */
  fullWidth?: boolean;
  children: ReactNode;
};

function SidebarModule({
  mod,
  status,
  onGo,
}: {
  mod: ConsoleModule;
  status: ModuleStatus;
  onGo: () => void;
}) {
  const Icon = mod.icon;
  return (
    <li>
      <button
        type="button"
        disabled={status === "locked"}
        onClick={onGo}
        className={`w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
          status === "current"
            ? "bg-[#00a884]/20 ring-1 ring-[#00a884]/40"
            : status === "locked"
              ? "text-white/30 cursor-not-allowed"
              : "text-white/85 hover:bg-white/5"
        }`}
      >
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            status === "current" ? "bg-[#00a884] text-white" : "bg-white/10"
          }`}
        >
          {status === "done" ? (
            <CheckCircle2 className="h-4 w-4 text-[#00a884]" />
          ) : status === "locked" ? (
            <Lock className="h-3.5 w-3.5" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight">{mod.label}</span>
          <span className="block text-[11px] text-white/45 mt-0.5">{mod.subtitle}</span>
        </span>
      </button>
    </li>
  );
}

export function OnboardingConsoleLayout({
  reference,
  currentModule,
  modules,
  step,
  canGoTo,
  moduleStatus,
  onGoTo,
  onClose,
  progressSteps,
  stepIndex,
  submitted = false,
  fullWidth = false,
  children,
}: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex bg-[#e8ecef]">
      <aside className="hidden md:flex w-[280px] shrink-0 flex-col bg-[#111b21] text-white border-r border-white/10">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-1.5">
              <img src="/videh_icon_foreground.png" alt="" className="h-full w-full object-contain" />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight">Videh Business API</p>
              <p className="text-[10px] uppercase tracking-wider text-white/45 mt-0.5">
                {submitted ? "Developer console" : "Application console"}
              </p>
            </div>
          </div>
          {reference ? (
            <p className="mt-3 text-xs font-mono text-[#00a884] bg-[#00a884]/10 px-2 py-1 rounded-md truncate">{reference}</p>
          ) : (
            <p className="mt-3 text-xs text-white/40">
              {submitted ? "Manage templates, channel & API" : "Complete each module to submit"}
            </p>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {!submitted && modules.some((m) => m.section === "setup") ? (
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">Application setup</p>
              <ul className="space-y-0.5">
                {modules.filter((m) => m.section === "setup").map((mod) => (
                  <SidebarModule key={mod.id} mod={mod} status={moduleStatus(mod)} onGo={() => onGoTo(mod.id)} />
                ))}
              </ul>
            </div>
          ) : null}
          {modules.some((m) => m.section === "review") ? (
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">After submission</p>
              <ul className="space-y-0.5">
                {modules.filter((m) => m.section === "review").map((mod) => (
                  <SidebarModule key={mod.id} mod={mod} status={moduleStatus(mod)} onGo={() => onGoTo(mod.id)} />
                ))}
              </ul>
            </div>
          ) : null}
          {modules.some((m) => m.section === "workspace") ? (
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">Manage your account</p>
              <ul className="space-y-0.5">
                {modules.filter((m) => m.section === "workspace").map((mod) => (
                  <SidebarModule key={mod.id} mod={mod} status={moduleStatus(mod)} onGo={() => onGoTo(mod.id)} />
                ))}
              </ul>
            </div>
          ) : null}
        </nav>
        <div className="p-4 border-t border-white/10 text-xs text-white/45">
          <p className="flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" /> developer@videh.co.in
          </p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="shrink-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 gap-3">
          <div className="flex items-center gap-3 min-w-0 md:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00a884]/10 p-1">
              <img src="/videh_icon_foreground.png" alt="" className="h-full w-full object-contain" />
            </span>
            <span className="font-semibold text-sm text-[#111b21] truncate">Videh API Console</span>
          </div>
          <div className="hidden md:block min-w-0">
            <p className="text-xs text-[#667781] font-medium uppercase tracking-wide">Module</p>
            <h1 className="text-lg font-bold text-[#111b21] truncate">{currentModule.label}</h1>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {reference ? (
              <span className="hidden sm:inline text-xs font-mono text-[#00a884] bg-[#00a884]/10 px-2 py-1 rounded-md">{reference}</span>
            ) : null}
            <button type="button" onClick={onClose} className="text-[#667781] hover:text-[#111b21] p-2 rounded-lg hover:bg-gray-100" aria-label="Exit console">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="md:hidden shrink-0 bg-white border-b border-gray-200 px-3 py-2 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {modules.map((mod) => (
              <button
                key={mod.id}
                type="button"
                disabled={!canGoTo(mod.id)}
                onClick={() => onGoTo(mod.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                  step === mod.id ? "bg-[#00a884] text-white" : !canGoTo(mod.id) ? "bg-gray-100 text-gray-400" : "bg-gray-100 text-[#111b21]"
                }`}
              >
                {mod.label}
              </button>
            ))}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8" data-console-main>
          <div className={fullWidth ? "w-full max-w-none" : "max-w-3xl mx-auto w-full"}>
            <div className="md:hidden mb-4">
              <h1 className="text-xl font-bold text-[#111b21]">{currentModule.label}</h1>
              <p className="text-sm text-[#667781]">{currentModule.subtitle}</p>
            </div>
            {!submitted && progressSteps.length > 0 ? (
              <div className="flex gap-1 mb-6">
                {progressSteps.map((s, i) => (
                  <div key={s} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-[#00a884]" : "bg-gray-200"}`} />
                ))}
              </div>
            ) : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
