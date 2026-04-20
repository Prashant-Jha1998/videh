const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const filesToDelete = ["package-lock.json", "yarn.lock"];

for (const filename of filesToDelete) {
  const target = path.join(workspaceRoot, filename);
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
  }
}

const userAgent = process.env.npm_config_user_agent ?? "";

if (!userAgent.startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}
