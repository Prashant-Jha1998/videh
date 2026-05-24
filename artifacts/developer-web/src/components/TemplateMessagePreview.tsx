import type { TemplateDraft } from "../lib/videhTemplate";
import { TemplateVidehPreview } from "./TemplateVidehPreview";

const marketingDemo: TemplateDraft = {
  templateKey: "welcome_offer",
  name: "Welcome offer",
  category: "marketing",
  language: "en",
  headerFormat: "IMAGE",
  headerText: "",
  headerMediaUrl: "",
  bodyText:
    "Hello {{1}} 👋\n\nAs a valued customer, get upto 20% off on your next order!\n\n✅ Instant order updates\n✅ OTP & payment alerts\n✅ Go-live in 7 working days\n\nReady to get started? Tap below.",
  footerText: "Videh Business API",
  buttons: [{ type: "URL", text: "Yes, let's do it!", url: "https://videh.co.in" }],
  variableSamples: { "1": "Rahul" },
};

/** Marketing hero — static demo; developer console uses live `TemplateVidehPreview`. */
export function TemplateMessagePreview() {
  return <TemplateVidehPreview draft={marketingDemo} businessName="Your Brand Pvt Ltd" />;
}
