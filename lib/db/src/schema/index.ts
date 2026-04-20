import {
  boolean,
  integer,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  about: text("about"),
  avatarUrl: text("avatar_url"),
  isOnline: boolean("is_online").notNull().default(false),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  preferredLang: text("preferred_lang"),
  fontSize: text("font_size"),
  twoStepPin: text("two_step_pin"),
  pushToken: text("push_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chats = pgTable("chats", {
  id: serial("id").primaryKey(),
  isGroup: boolean("is_group").notNull().default(false),
  groupName: text("group_name"),
  groupAvatarUrl: text("group_avatar_url"),
  groupDescription: text("group_description"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  disappearAfterSeconds: integer("disappear_after_seconds"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: integer("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    isAdmin: boolean("is_admin").notNull().default(false),
    isMuted: boolean("is_muted").notNull().default(false),
    isPinned: boolean("is_pinned").notNull().default(false),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    wallpaper: text("wallpaper"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.userId] }),
  }),
);

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  type: text("type").notNull().default("text"),
  mediaUrl: text("media_url"),
  replyToId: integer("reply_to_id"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  isForwarded: boolean("is_forwarded").notNull().default(false),
  forwardCount: integer("forward_count").notNull().default(0),
  isStarred: boolean("is_starred").notNull().default(false),
  isViewOnce: boolean("is_view_once").notNull().default(false),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.messageId, table.userId] }),
  }),
);

export const messageStatus = pgTable(
  "message_status",
  {
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("sent"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.messageId, table.userId] }),
  }),
);

export const typingSessions = pgTable(
  "typing_sessions",
  {
    chatId: integer("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.userId] }),
  }),
);

export const statuses = pgTable("statuses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  type: text("type").notNull().default("text"),
  backgroundColor: text("background_color").notNull().default("#00A884"),
  mediaUrl: text("media_url"),
  expiresAt: timestamp("expires_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW() + INTERVAL '24 hours'`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const statusViews = pgTable(
  "status_views",
  {
    statusId: integer("status_id").notNull().references(() => statuses.id, { onDelete: "cascade" }),
    viewerId: integer("viewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.statusId, table.viewerId] }),
  }),
);

export const statusReactions = pgTable(
  "status_reactions",
  {
    statusId: integer("status_id").notNull().references(() => statuses.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    reactedAt: timestamp("reacted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.statusId, table.userId] }),
  }),
);

export const calls = pgTable("calls", {
  id: serial("id").primaryKey(),
  callerId: integer("caller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  calleeId: integer("callee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("audio"),
  status: text("status").notNull().default("missed"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scheduledMessages = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  type: text("type").notNull().default("text"),
  replyToId: integer("reply_to_id"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  sent: boolean("sent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const khataEntries = pgTable("khata_entries", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  createdBy: integer("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  debtorName: text("debtor_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  paid: boolean("paid").notNull().default(false),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sosContacts = pgTable("sos_contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone"),
  contactUserId: integer("contact_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const blockedUsers = pgTable(
  "blocked_users",
  {
    blockerId: integer("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedId: integer("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.blockerId, table.blockedId] }),
  }),
);

export const contacts = pgTable(
  "contacts",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    contactUserId: integer("contact_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isBlocked: boolean("is_blocked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.contactUserId] }),
  }),
);

export const broadcastLists = pgTable("broadcast_lists", {
  id: serial("id").primaryKey(),
  creatorId: integer("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const broadcastRecipients = pgTable(
  "broadcast_recipients",
  {
    listId: integer("list_id")
      .notNull()
      .references(() => broadcastLists.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.listId, table.userId] }),
  }),
);

export const webSessions = pgTable("web_sessions", {
  token: text("token").primaryKey(),
  status: text("status").notNull().default("pending"),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  deviceName: text("device_name"),
  platform: text("platform"),
  linkedAt: timestamp("linked_at", { withTimezone: true }),
  lastActive: timestamp("last_active", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});