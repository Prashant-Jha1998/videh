/**
 * PM2 cluster — WebRTC/signaling need shared state; use 2+ workers only with REDIS_URL.
 *
 * Env on server (.env):
 *   REDIS_URL=rediss://...          ElastiCache — required for API_WORKERS > 1
 *   PG_POOL_MAX=15                  per worker (workers × PG_POOL_MAX < RDS max_connections)
 *   MEDIA_PUBLIC_BASE_URL=https://cdn.videh.co.in   CloudFront distribution URL
 *   AWS_S3_BUCKET=videh-media-prod                  S3 bucket (origin for CloudFront)
 *   AWS_REGION=ap-south-1                           bucket region
 *   S3_DELETE_LOCAL_AFTER_UPLOAD=1                  free EC2 disk after upload (optional)
 *   S3_DIRECT_UPLOAD=1                              presigned PUT for reels (default on when S3 set)
 *   API_WORKERS=max                 override instance count (ignored without REDIS_URL)
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const out = {};
    for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

const envFilePath =
  process.env.VIDEOH_ENV_FILE || path.join(__dirname, ".env");
const fileEnv = loadEnvFile(envFilePath);
const mergedEnv = { ...fileEnv, ...process.env };
const hasRedis = Boolean(mergedEnv.REDIS_URL || mergedEnv.UPSTASH_REDIS_URL);

function resolveInstances() {
  if (!hasRedis) {
    const requested = mergedEnv.API_WORKERS;
    if (requested && requested !== "1" && Number(requested) !== 1) {
      console.warn(
        "[videh-api] API_WORKERS=%s ignored — WebRTC requires REDIS_URL for multi-worker; using 1 instance",
        requested,
      );
    }
    return 1;
  }
  const raw = mergedEnv.API_WORKERS;
  if (!raw || raw === "1") return 1;
  if (raw === "max") return os.cpus().length;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

const instances = resolveInstances();

module.exports = {
  apps: [
    {
      name: "videh-api",
      script: "dist/index.mjs",
      cwd: "/var/www/videh/artifacts/api-server",
      interpreter: "node",
      node_args: `--env-file=${envFilePath} --enable-source-maps`,
      instances,
      exec_mode: instances > 1 ? "cluster" : "fork",
      max_memory_restart: "1200M",
      listen_timeout: 15000,
      kill_timeout: 8000,
      merge_logs: true,
    },
  ],
};
