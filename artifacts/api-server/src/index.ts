import app from "./app";
import { logger } from "./lib/logger";
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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  const workers = process.env["NODE_APP_INSTANCE"] ?? process.env["PM2_INSTANCE_ID"] ?? "0";
  logger.info({ port, worker: workers }, "Server listening");
});
