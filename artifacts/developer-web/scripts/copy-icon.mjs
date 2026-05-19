import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.resolve(root, "../videh/assets/images/videh_icon_foreground.png");
const dest = path.resolve(root, "dist/public/videh_icon_foreground.png");
const publicDest = path.resolve(root, "public/videh_icon_foreground.png");

if (!fs.existsSync(src)) {
  console.warn("Videh icon not found; skipping copy");
  process.exit(0);
}

for (const target of [dest, publicDest]) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(src, target);
}
console.log("Copied Videh icon to public/ and dist/public/");
