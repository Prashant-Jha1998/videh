import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import cron from "node-cron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import businessApiV1Router from "./routes/business-api-v1";
import { logger } from "./lib/logger";
import { query } from "./lib/db";
import { stateAcquireLock, stateDelete } from "./lib/sharedState";
import { notifyChatMessageDelivered } from "./lib/dispatchChatMessage";
import { runAdminSlaEscalationJob } from "./lib/adminEscalation";
import { ensureAdminUsersTable } from "./lib/adminUsers";
import { enforceAllOverdueBillingHolds } from "./lib/developerBilling";

const app: Express = express();
app.set("trust proxy", 1);
// Disable ETag globally: polling endpoints (WebRTC signaling, call status) must
// never return 304 with an empty body, which would hide the SDP offer/answer and
// stall call setup. APIs do not benefit from conditional GET caching here.
app.set("etag", false);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "80mb" }));
app.use(express.urlencoded({ extended: true, limit: "80mb" }));

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const apiServerDir = path.resolve(currentDir, "..");
const uploadsDir = path.resolve(apiServerDir, "uploads");
const videhWebDistDir = path.resolve(apiServerDir, "../videh-web/dist/public");
const videhWebIndexPath = path.join(videhWebDistDir, "index.html");
const adminWebDistDir = path.resolve(apiServerDir, "../admin-web/dist/public");
const adminWebIndexPath = path.join(adminWebDistDir, "index.html");

fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

if (fs.existsSync(adminWebIndexPath)) {
  app.use(
    "/admin",
    express.static(adminWebDistDir, {
      index: false,
      redirect: false,
    }),
  );
  app.get(/^\/admin\/?(?:.*)?$/, (req, res, next) => {
    const rel = req.path.replace(/^\/admin\/?/, "");
    if (rel.startsWith("assets/") || /\.[a-zA-Z0-9]+$/.test(rel)) {
      next();
      return;
    }
    res.sendFile(adminWebIndexPath);
  });
} else {
  logger.warn({ adminWebDistDir }, "admin-web build not found; /admin route disabled");
}

if (fs.existsSync(videhWebIndexPath)) {
  app.use(
    "/videh-web",
    express.static(videhWebDistDir, {
      index: false,
      redirect: false,
    }),
  );

  app.get(/^\/videh-web(?:\/.*)?$/, (_req, res) => {
    res.sendFile(videhWebIndexPath);
  });
} else {
  logger.warn({ videhWebDistDir }, "videh-web build not found; /videh-web route disabled");
}

const grievanceFormPath = path.resolve(apiServerDir, "public/grievance.html");
if (fs.existsSync(grievanceFormPath)) {
  app.get("/grievance", (_req, res) => {
    res.sendFile(grievanceFormPath);
  });
}

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    apiHealth: "/api/healthz",
    videhWeb: "/videh-web/",
    adminPanel: fs.existsSync(adminWebIndexPath) ? "/admin/" : null,
    publicGrievance: fs.existsSync(grievanceFormPath) ? "/grievance" : "/api/grievance",
  });
});

app.use("/v1", businessApiV1Router);
app.use("/api", router);

// Cron: every minute — check for due scheduled messages and send them
cron.schedule("* * * * *", async () => {
  try {
    const lockKey = "jobs:scheduled-messages:lock";
    if (!(await stateAcquireLock(lockKey, 55_000))) return;
    const due = await query(
      `SELECT sm.*, u.name as sender_name, u.push_token as sender_token
       FROM scheduled_messages sm
       JOIN users u ON u.id = sm.sender_id
       WHERE sm.sent = FALSE AND sm.scheduled_at <= NOW()`,
      []
    );
    for (const sm of due.rows) {
      const insertResult = await query(
        `INSERT INTO messages (chat_id, sender_id, content, type, reply_to_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [sm.chat_id, sm.sender_id, sm.content, sm.type, sm.reply_to_id ?? null],
      );
      const message = insertResult.rows[0] as {
        id: number;
        chat_id: number;
        sender_id: number;
        content: string;
        type: string;
        media_url?: string | null;
      };

      await query("UPDATE scheduled_messages SET sent = TRUE WHERE id = $1", [sm.id]);
      if (sm.khata_entry_id) {
        await query(
          `UPDATE khata_entries SET reminder_sent = TRUE WHERE id = $1`,
          [sm.khata_entry_id],
        );
      }

      await notifyChatMessageDelivered({
        message,
        senderName: sm.sender_name,
        senderId: Number(sm.sender_id),
        chatId: Number(sm.chat_id),
      });

      logger.info({ scheduledId: sm.id, messageId: message.id }, "Scheduled message sent");
    }
    await stateDelete("jobs:scheduled-messages:lock");
  } catch (err) {
    await stateDelete("jobs:scheduled-messages:lock").catch(() => {});
    logger.error({ err }, "Scheduled message cron error");
  }
});

void ensureAdminUsersTable().catch((err) => logger.error({ err }, "admin users bootstrap failed"));

cron.schedule("*/15 * * * *", async () => {
  try {
    const lockKey = "jobs:admin-sla-escalation:lock";
    if (!(await stateAcquireLock(lockKey, 14 * 60_000))) return;
    await runAdminSlaEscalationJob();
    await stateDelete(lockKey);
  } catch (err) {
    await stateDelete("jobs:admin-sla-escalation:lock").catch(() => {});
    logger.error({ err }, "Admin SLA escalation cron error");
  }
});

/** Every minute — scan pending reels videos for NSFW before publish */
cron.schedule("* * * * *", async () => {
  try {
    const lockKey = "jobs:reels-moderation:lock";
    if (!(await stateAcquireLock(lockKey, 55_000))) return;
    const { processPendingReelsModeration } = await import("./lib/reelsModerationQueue");
    const processed = await processPendingReelsModeration(15);
    if (processed > 0) {
      logger.info({ processed }, "Reels NSFW moderation queue processed");
    }
    await stateDelete(lockKey);
  } catch (err) {
    await stateDelete("jobs:reels-moderation:lock").catch(() => {});
    logger.error({ err }, "Reels moderation cron error");
  }
});

/** Every hour — hold API accounts with unpaid invoices past due date */
cron.schedule("0 * * * *", async () => {
  try {
    const lockKey = "jobs:developer-billing-overdue:lock";
    if (!(await stateAcquireLock(lockKey, 55 * 60_000))) return;
    const count = await enforceAllOverdueBillingHolds();
    if (count > 0) {
      logger.info({ count }, "Developer API accounts placed on billing hold (overdue invoice)");
    }
    await stateDelete(lockKey);
  } catch (err) {
    await stateDelete("jobs:developer-billing-overdue:lock").catch(() => {});
    logger.error({ err }, "Developer overdue billing cron error");
  }
});

/** Every 5 minutes — delete expired disappearing messages. */
cron.schedule("*/5 * * * *", async () => {
  try {
    const lockKey = "jobs:disappear-messages:lock";
    if (!(await stateAcquireLock(lockKey, 4 * 60_000))) return;
    const { purgeExpiredDisappearingMessages } = await import("./lib/disappearingMessages");
    const deleted = await purgeExpiredDisappearingMessages();
    if (deleted > 0) {
      logger.info({ deleted }, "Purged expired disappearing messages");
    }
    await stateDelete(lockKey);
  } catch (err) {
    await stateDelete("jobs:disappear-messages:lock").catch(() => {});
    logger.error({ err }, "Disappearing messages purge cron error");
  }
});

/** Daily — permanently delete chat messages older than 90 days. */
cron.schedule("15 3 * * *", async () => {
  try {
    const lockKey = "jobs:message-retention:lock";
    if (!(await stateAcquireLock(lockKey, 50 * 60_000))) return;
    const { purgeMessagesBeyondRetention } = await import("./lib/messageRetention");
    let total = 0;
    for (let i = 0; i < 40; i += 1) {
      const batch = await purgeMessagesBeyondRetention(500);
      total += batch;
      if (batch < 500) break;
    }
    if (total > 0) {
      logger.info({ deleted: total }, "Purged messages beyond 90-day retention");
    }
    await stateDelete(lockKey);
  } catch (err) {
    await stateDelete("jobs:message-retention:lock").catch(() => {});
    logger.error({ err }, "Message retention purge cron error");
  }
});

export default app;
