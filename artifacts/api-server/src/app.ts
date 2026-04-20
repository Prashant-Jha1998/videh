import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cron from "node-cron";
import router from "./routes";
import { logger } from "./lib/logger";
import { query } from "./lib/db";

const app: Express = express();

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
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Cron: every minute — check for due scheduled messages and send them
cron.schedule("* * * * *", async () => {
  try {
    const due = await query(
      `SELECT sm.*, u.name as sender_name, u.push_token as sender_token
       FROM scheduled_messages sm
       JOIN users u ON u.id = sm.sender_id
       WHERE sm.sent = FALSE AND sm.scheduled_at <= NOW()`,
      []
    );
    for (const sm of due.rows) {
      // Insert as a real message
      await query(
        `INSERT INTO messages (chat_id, sender_id, content, type, reply_to_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [sm.chat_id, sm.sender_id, sm.content, sm.type, sm.reply_to_id ?? null]
      );
      // Mark as sent
      await query("UPDATE scheduled_messages SET sent = TRUE WHERE id = $1", [sm.id]);

      // Push to all chat members
      const members = await query(
        `SELECT u.push_token FROM chat_members cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.chat_id = $1 AND cm.user_id != $2`,
        [sm.chat_id, sm.sender_id]
      );
      const tokens = members.rows
        .map((r: any) => r.push_token)
        .filter((t: any) => typeof t === "string" && t.startsWith("ExponentPushToken"));
      if (tokens.length > 0) {
        fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tokens.map((to: string) => ({
            to,
            title: sm.sender_name ?? "Videh",
            body: sm.content.slice(0, 100),
            data: { chatId: sm.chat_id },
            sound: "default",
          }))),
        }).catch(() => {});
      }
      logger.info({ scheduledId: sm.id }, "Scheduled message sent");
    }
  } catch (err) {
    logger.error({ err }, "Scheduled message cron error");
  }
});

export default app;
