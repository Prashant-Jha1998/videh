import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const i18nDir = path.join(__dirname, "../lib/i18n");

function extractKeys(block) {
  return [...block.matchAll(/"([^"]+)":/g)].map((m) => m[1]);
}

const enBlock = fs.readFileSync(path.join(i18nDir, "en.ts"), "utf8").match(/export const en[^=]*=\s*\{([\s\S]*?)\};/)[1];
const enKeys = extractKeys(enBlock);
console.log("en keys:", enKeys.length);

const localeFiles = fs.readdirSync(path.join(i18nDir, "locales")).filter((f) => f.endsWith(".ts"));

for (const file of localeFiles) {
  const code = file.replace(".ts", "");
  const text = fs.readFileSync(path.join(i18nDir, "locales", file), "utf8");
  const m = text.match(/locale\(\{([\s\S]*?)\}\)/);
  const locKeys = m ? extractKeys(m[1]) : [];
  const missing = enKeys.filter((k) => !locKeys.includes(k));
  const stillEnglish = enKeys.filter((k) => {
    const enVal = enBlock.match(new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"([^"]*)"`))?.[1]
      ?? enBlock.match(new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*\\n\\s*"([^"]*)"`))?.[1];
    const locVal = m?.[1].match(new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"([^"]*)"`))?.[1];
    return enVal && locVal === enVal;
  });
  console.log(`${code}: ${locKeys.length} overrides, ${missing.length} missing, ${stillEnglish.length} same-as-en`);
}
