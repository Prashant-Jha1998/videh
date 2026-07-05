import { Router, type Request, type Response } from "express";
import { assertSameUser, requireAuth } from "../lib/auth";
import { query } from "../lib/db";
import { publishChatEvent } from "../lib/realtime";
import { insertChatSystemMessage } from "../lib/chatSystemMessages";
import { canAddUserToGroup } from "../lib/userPrivacySettings";
import {
  canSendAfterInviteApproval,
  createGroupInviteLink,
  ensureGroupInviteTables,
  resolveGroupInviteToken,
} from "../lib/groupInviteLinks";
import {
  getGroupPermissions,
  shouldHidePreJoinHistory,
} from "../lib/groupPermissions";

const router = Router();

/** Preview group invite (no chat id exposed). */
router.get("/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "").trim();
  if (!token || token.length < 12) {
    res.status(400).json({ success: false, message: "Invalid invite link." });
    return;
  }
  try {
    const info = await resolveGroupInviteToken(token);
    if (!info) {
      res.status(404).json({ success: false, message: "This invite link is invalid or expired." });
      return;
    }
    res.json({
      success: true,
      invite: {
        token,
        groupName: info.groupName,
        memberCount: info.memberCount,
      },
    });
  } catch (err) {
    req.log.error({ err }, "resolve group invite");
    res.status(500).json({ success: false });
  }
});

/** Join group via secure invite token (admin approval required before sending). */
router.post("/:token/join", requireAuth, async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "").trim();
  const joinerId = Number((req as { authUserId?: number }).authUserId);
  if (!token || !joinerId) {
    res.status(400).json({ success: false });
    return;
  }
  try {
    await ensureGroupInviteTables();
    const info = await resolveGroupInviteToken(token);
    if (!info) {
      res.status(404).json({ success: false, message: "This invite link is invalid or expired." });
      return;
    }

    const existing = await query(
      `SELECT join_pending_approval, COALESCE(can_send_messages, TRUE) AS can_send_messages
       FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [info.chatId, joinerId],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0] as { join_pending_approval: boolean; can_send_messages: boolean };
      res.json({
        success: true,
        chatId: info.chatId,
        groupName: info.groupName,
        pendingApproval: Boolean(row.join_pending_approval),
        canSendMessages: Boolean(row.can_send_messages) && !row.join_pending_approval,
        alreadyMember: true,
      });
      return;
    }

    const allowed = await canAddUserToGroup(info.createdBy, joinerId);
    if (!allowed) {
      res.status(403).json({
        success: false,
        message: "You cannot join groups based on your privacy settings.",
      });
      return;
    }

    const perms = await getGroupPermissions(info.chatId);
    const needsApproval = Boolean(perms?.approveNewMembers);
    const hideHistory = perms ? shouldHidePreJoinHistory(perms) : true;

    const pol = await query(
      `SELECT COALESCE(NULLIF(TRIM(group_messaging_policy), ''), 'everyone') AS policy FROM chats WHERE id = $1`,
      [info.chatId],
    );
    const policy = String(pol.rows[0]?.policy || "everyone");
    const canSendOnJoin = policy !== "allowlist" && policy !== "admins_only";

    await query(
      `INSERT INTO chat_members (
         chat_id, user_id, is_admin, can_send_messages, join_pending_approval, history_cleared_at, joined_at
       ) VALUES ($1, $2, FALSE, $3, $4, ${hideHistory ? "NOW()" : "NULL"}, NOW())`,
      [info.chatId, joinerId, needsApproval ? false : canSendOnJoin, needsApproval],
    );

    const joiner = await query("SELECT name FROM users WHERE id = $1", [joinerId]);
    const joinerName = String(joiner.rows[0]?.name ?? "Someone");

    if (needsApproval) {
      const admins = await query(
        `SELECT user_id FROM chat_members WHERE chat_id = $1 AND is_admin = TRUE`,
        [info.chatId],
      );
      const adminIds = admins.rows.map((r: { user_id: number }) => Number(r.user_id));

      publishChatEvent({
        type: "group_join_request",
        chatId: String(info.chatId),
        userIds: [...adminIds, joinerId],
        payload: {
          chatId: info.chatId,
          userId: joinerId,
          userName: joinerName,
          groupName: info.groupName,
        },
      });

      res.json({
        success: true,
        chatId: info.chatId,
        groupName: info.groupName,
        pendingApproval: true,
        canSendMessages: false,
        alreadyMember: false,
        message: "You joined the group. An admin must approve you before you can send messages.",
      });
      return;
    }

    await insertChatSystemMessage(info.chatId, joinerId, {
      kind: "member_joined",
      userId: joinerId,
      userName: joinerName,
      viaInvite: true,
    });

    res.json({
      success: true,
      chatId: info.chatId,
      groupName: info.groupName,
      pendingApproval: false,
      canSendMessages: canSendOnJoin,
      alreadyMember: false,
      message: "You joined the group.",
    });
  } catch (err) {
    req.log.error({ err }, "join group invite");
    res.status(500).json({ success: false, message: "Could not join group." });
  }
});

export default router;
