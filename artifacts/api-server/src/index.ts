import app from "./app";
import { logger } from "./lib/logger";
import { isRedisBusEnabled } from "./lib/redisBus";
import { initRealtimeBus } from "./lib/realtime";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await initRealtimeBus();

const pm2Instance = Number(process.env["NODE_APP_INSTANCE"] ?? process.env["PM2_INSTANCE_ID"] ?? "0");
if (!isRedisBusEnabled() && pm2Instance > 0) {
  logger.error(
    { worker: pm2Instance },
    "WebRTC/signaling require a single API worker without REDIS_URL — set API_WORKERS=1 and restart PM2",
  );
  process.exit(1);
}
if (!isRedisBusEnabled() && pm2Instance === 0) {
  logger.info("WebRTC mode: single API worker (set REDIS_URL + API_WORKERS>1 for horizontal scale)");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  const workers = process.env["NODE_APP_INSTANCE"] ?? process.env["PM2_INSTANCE_ID"] ?? "0";
  logger.info({ port, worker: workers }, "Server listening");
});
