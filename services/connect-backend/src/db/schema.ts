import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "member"]);
export const statusEnum = pgEnum("account_status", [
  "pending_verification",
  "pending",
  "active",
  "rejected",
  "suspended",
  "banned",
]);
export const tokenPurposeEnum = pgEnum("token_purpose", ["verify_email", "reset_password", "mfa_ticket"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    bio: text("bio"),
    avatarKey: text("avatar_key"),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("member"),
    status: statusEnum("status").notNull().default("pending_verification"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    /** AES-256-GCM ciphertext of the TOTP seed (pending or confirmed). */
    totpSecretEnc: text("totp_secret_enc"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_username_lower_uq").on(sql`lower(${t.username})`),
    uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`),
    index("users_status_idx").on(t.status),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    /** False while an admin still has to pass or enroll MFA. */
    mfaPassed: boolean("mfa_passed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [uniqueIndex("sessions_token_hash_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)]
);

export const oneTimeTokens = pgTable(
  "one_time_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: tokenPurposeEnum("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("one_time_tokens_hash_uq").on(t.tokenHash), index("one_time_tokens_user_idx").on(t.userId)]
);

export const recoveryCodes = pgTable(
  "recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("recovery_codes_user_idx").on(t.userId)]
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)]
);

export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    ip: text("ip"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("security_events_created_idx").on(t.createdAt)]
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;

/* ------------------------------ Phase 3: messaging ------------------------------ */

export const channelKindEnum = pgEnum("channel_kind", ["public", "restricted"]);

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    kind: channelKindEnum("kind").notNull().default("public"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("channels_name_lower_uq").on(sql`lower(${t.name})`)]
);

/** Explicit members of restricted channels (public channels are open to every active user). */
export const channelMembers = pgTable(
  "channel_members",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("channel_members_uq").on(t.channelId, t.userId)]
);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  isGroup: boolean("is_group").notNull().default(false),
  title: text("title"),
  /** For 1:1 conversations: "<smallerUserId>:<largerUserId>", so each pair has one conversation. */
  directKey: text("direct_key").unique(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    mutedAt: timestamp("muted_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("conversation_participants_uq").on(t.conversationId, t.userId), index("conversation_participants_user_idx").on(t.userId)]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    /** Client-generated id so a retried send is stored once. */
    clientId: text("client_id").notNull(),
    body: text("body").notNull(),
    replyToId: uuid("reply_to_id"),
    forwardedFromId: uuid("forwarded_from_id"),
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    pinnedBy: uuid("pinned_by"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_channel_created_idx").on(t.channelId, t.createdAt),
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    uniqueIndex("messages_author_client_uq").on(t.authorId, t.clientId),
    index("messages_search_idx").using("gin", sql`to_tsvector('simple', ${t.body})`),
  ]
);

export const reactions = pgTable(
  "reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reactions_uq").on(t.messageId, t.userId, t.emoji)]
);

/** Per user, per channel or conversation: the newest message they have read. */
export const readStates = pgTable(
  "read_states",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "ch:<uuid>" or "cv:<uuid>" */
    target: text("target").notNull(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("read_states_uq").on(t.userId, t.target)]
);

export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("blocks_uq").on(t.blockerId, t.blockedId)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)]
);

export type Message = typeof messages.$inferSelect;
