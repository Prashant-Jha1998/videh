import fs from "node:fs";

const p = new URL("../src/components/OnboardingWizard.tsx", import.meta.url);
let s = fs.readFileSync(p, "utf8");

if (!s.includes("function canGoTo")) {
  s = s.replace(
    "  const requiredMissing = docs.filter((d) => d.required && !uploaded.has(d.key));\r\n\r\n  return (",
    `  const requiredMissing = docs.filter((d) => d.required && !uploaded.has(d.key));
  const currentModule = MODULES.find((m) => m.id === step) ?? MODULES[0]!;

  useEffect(() => {
    if (stepIndex > maxReachedIndex) setMaxReachedIndex(stepIndex);
  }, [stepIndex, maxReachedIndex]);

  function canGoTo(target: Step): boolean {
    if (target === "done") return step === "done" || maxReachedIndex >= STEPS.indexOf("payment");
    return STEPS.indexOf(target) <= maxReachedIndex;
  }

  function goToModule(target: Step) {
    if (!canGoTo(target)) return;
    setStep(target);
    setError("");
  }

  function moduleStatus(mod: (typeof MODULES)[number]): "current" | "done" | "available" | "locked" {
    const idx = STEPS.indexOf(mod.id);
    if (step === mod.id) return "current";
    if (!canGoTo(mod.id)) return "locked";
    if (idx < stepIndex) return "done";
    return "available";
  }

  const statusOrder = ["draft", "payment_pending", "paid", "documents_review", "channel_setup", "templates_review", "approved"];
  const statusIdx = statusOrder.indexOf(leadStatus);

  return (`,
  );
  s = s.replace(
    "  const requiredMissing = docs.filter((d) => d.required && !uploaded.has(d.key));\n\n  return (",
    `  const requiredMissing = docs.filter((d) => d.required && !uploaded.has(d.key));
  const currentModule = MODULES.find((m) => m.id === step) ?? MODULES[0]!;

  useEffect(() => {
    if (stepIndex > maxReachedIndex) setMaxReachedIndex(stepIndex);
  }, [stepIndex, maxReachedIndex]);

  function canGoTo(target: Step): boolean {
    if (target === "done") return step === "done" || maxReachedIndex >= STEPS.indexOf("payment");
    return STEPS.indexOf(target) <= maxReachedIndex;
  }

  function goToModule(target: Step) {
    if (!canGoTo(target)) return;
    setStep(target);
    setError("");
  }

  function moduleStatus(mod: (typeof MODULES)[number]): "current" | "done" | "available" | "locked" {
    const idx = STEPS.indexOf(mod.id);
    if (step === mod.id) return "current";
    if (!canGoTo(mod.id)) return "locked";
    if (idx < stepIndex) return "done";
    return "available";
  }

  const statusOrder = ["draft", "payment_pending", "paid", "documents_review", "channel_setup", "templates_review", "approved"];
  const statusIdx = statusOrder.indexOf(leadStatus);

  return (`,
  );
}

const headerStart = s.indexOf("  return (\r\n    <motion.div");
const headerStartLf = s.indexOf("  return (\n    <div className=\"fixed inset-0 z-[100] bg-[#0b141a]/95");
const start = headerStartLf >= 0 ? headerStartLf : s.indexOf('  return (\r\n    <motion.div className="fixed');
if (start < 0) {
  const alt = s.indexOf('  return (\n    <div className="fixed inset-0 z-[100] bg-[#0b141a]/95');
  if (alt < 0) throw new Error("start not found");
}
const errMarker = '{error ? (\r\n            <p className="mb-4 text-sm text-red-300';
const errIdx = s.indexOf(errMarker);
if (errIdx < 0) {
  const errIdx2 = s.indexOf('{error ? (\n            <p className="mb-4 text-sm text-red-300');
  if (errIdx2 < 0) throw new Error("error block not found");
  const errEnd = s.indexOf(") : null}", errIdx2) + ") : null}".length;
  const before = s.slice(0, start);
  const after = s.slice(errEnd);
  const mid = `  return (
    <OnboardingConsoleLayout
      reference={reference}
      currentModule={currentModule}
      modules={MODULES}
      step={step}
      canGoTo={(id) => canGoTo(id as Step)}
      moduleStatus={moduleStatus}
      onGoTo={(id) => goToModule(id as Step)}
      onClose={onClose}
      progressSteps={[...STEPS.slice(0, -1)]}
      stepIndex={stepIndex}
    >
      {error ? (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>
      ) : null}`;
  s = before + mid + after;
} else {
  const errEnd = s.indexOf(") : null}", errIdx) + ") : null}".length;
  const before = s.slice(0, start);
  const after = s.slice(errEnd);
  const mid = `  return (
    <OnboardingConsoleLayout
      reference={reference}
      currentModule={currentModule}
      modules={MODULES}
      step={step}
      canGoTo={(id) => canGoTo(id as Step)}
      moduleStatus={moduleStatus}
      onGoTo={(id) => goToModule(id as Step)}
      onClose={onClose}
      progressSteps={[...STEPS.slice(0, -1)]}
      stepIndex={stepIndex}
    >
      {error ? (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>
      ) : null}`;
  s = before + mid + after;
}

s = s.replace(/\r\n        <\/main>\r\n      <\/div>\r\n    <\/motion.div>\r\n  \);/g, "\r\n    </OnboardingConsoleLayout>\r\n  );");
s = s.replace(/\n        <\/main>\n      <\/div>\n    <\/div>\n  \);/g, "\n    </OnboardingConsoleLayout>\n  );");

fs.writeFileSync(p, s);
console.log("patched");
