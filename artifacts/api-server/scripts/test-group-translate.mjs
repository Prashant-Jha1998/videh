import { translate } from "@vitalets/google-translate-api";

const text =
  "Hello everyone! I hope everyone is doing well. We have an important team meeting tomorrow at 10:30 AM.";

async function main() {
  const r = await translate(text, { to: "te", from: "auto" });
  const out = r.text?.trim() ?? "";
  const changed = out !== text.trim();
  console.log("target: te (Telugu)");
  console.log("changed:", changed);
  console.log("detected:", r.raw?.src ?? "unknown");
  console.log("sample:", out.slice(0, 160));
  if (!changed || !/[\u0C00-\u0C7F]/.test(out)) {
    console.error("FAIL: expected Telugu script output");
    process.exit(1);
  }
  console.log("PASS: English -> Telugu translation works");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
