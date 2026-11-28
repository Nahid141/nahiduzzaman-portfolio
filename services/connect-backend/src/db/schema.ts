import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  primaryKey,
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
    /** Cache-busting version of the profile photo in user_avatars (null = no photo). */
    avatarKey: text("avatar_key"),
    statusEmoji: text("status_emoji"),
    statusText: text("status_text"),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("member"),
    status: statusEnum("status").notNull().default("pending_verification"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, precision: 3 }),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true, precision: 3 }),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    /** AES-256-GCM ciphertext of the TOTP seed (pending or confirmed). */
    totpSecretEnc: text("totp_secret_enc"),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, precision: 3 }),
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
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, precision: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
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
    usedAt: timestamp("used_at", { withTimezone: true, precision: 3 }),
  },
  (t) => [index("recovery_codes_user_idx").on(t.userId)]
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
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
    archivedAt: timestamp("archived_at", { withTimezone: true, precision: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
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
    addedAt: timestamp("added_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
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
    archivedAt: timestamp("archived_at", { withTimezone: true, precision: 3 }),
    mutedAt: timestamp("muted_at", { withTimezone: true, precision: 3 }),
    joinedAt: timestamp("joined_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
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
    pinnedAt: timestamp("pinned_at", { withTimezone: true, precision: 3 }),
    pinnedBy: uuid("pinned_by"),
    editedAt: timestamp("edited_at", { withTimezone: true, precision: 3 }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, precision: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
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
    lastReadAt: timestamp("last_read_at", { withTimezone: true, precision: 3 }).notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
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
    readAt: timestamp("read_at", { withTimezone: true, precision: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)]
);

export type Message = typeof messages.$inferSelect;

/* --------------------------- Phase 4: file sharing --------------------------- */

export const fileKindEnum = pgEnum("file_kind", ["image", "document", "audio", "video", "archive"]);
export const fileStatusEnum = pgEnum("file_status", ["pending", "ready", "rejected", "deleted"]);

/** Metadata for objects in the private storage bucket. A file always belongs to one room. */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    objectPath: text("object_path").notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    kind: fileKindEnum("kind").notNull(),
    folder: text("folder").notNull().default(""),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256"),
    status: fileStatusEnum("status").notNull().default("pending"),
    rejectReason: text("reject_reason"),
    /** "not_scanned" until a scanner is configured; "hash_clean" or "malware" after a hash lookup. */
    scan: text("scan").notNull().default("not_scanned"),
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true, precision: 3 }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, precision: 3 }),
  },
  (t) => [
    uniqueIndex("files_object_path_uq").on(t.objectPath),
    index("files_owner_idx").on(t.ownerId),
    index("files_channel_created_idx").on(t.channelId, t.createdAt),
    index("files_conversation_created_idx").on(t.conversationId, t.createdAt),
    index("files_status_created_idx").on(t.status, t.createdAt),
  ]
);

export const messageAttachments = pgTable(
  "message_attachments",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.fileId] }), index("message_attachments_file_idx").on(t.fileId)]
);

/** Monthly counters for free-tier quotas (egress bytes, meeting minutes). */
export const usageCounters = pgTable(
  "usage_counters",
  {
    key: text("key").notNull(),
    period: text("period").notNull(),
    value: bigint("value", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.key, t.period] })]
);

export type FileRow = typeof files.$inferSelect;

/* ------------------------- Phase 5: video conferencing ------------------------- */

export const meetingStatusEnum = pgEnum("meeting_status", ["scheduled", "live", "ended"]);
export const participantStateEnum = pgEnum("participant_state", ["invited", "waiting", "admitted", "denied", "removed"]);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    hostId: uuid("host_id").references(() => users.id, { onDelete: "set null" }),
    /** Opaque LiveKit room name (no personal data). */
    room: text("room").notNull(),
    audioOnly: boolean("audio_only").notNull().default(false),
    /** Invite-only meetings admit only invited people; open meetings admit any active member. */
    inviteOnly: boolean("invite_only").notNull().default(false),
    waitingRoom: boolean("waiting_room").notNull().default(false),
    locked: boolean("locked").notNull().default(false),
    /** "host": only the host shares; "all": anyone; "approved": the host grants it per person. */
    screenShare: text("screen_share").notNull().default("all"),
    maxParticipants: integer("max_participants").notNull().default(15),
    status: meetingStatusEnum("status").notNull().default("live"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true, precision: 3 }),
    startedAt: timestamp("started_at", { withTimezone: true, precision: 3 }),
    endedAt: timestamp("ended_at", { withTimezone: true, precision: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("meetings_room_uq").on(t.room), index("meetings_status_idx").on(t.status, t.createdAt)]
);

export const meetingParticipants = pgTable(
  "meeting_participants",
  {
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    state: participantStateEnum("state").notNull(),
    canScreenShare: boolean("can_screen_share").notNull().default(false),
    handRaisedAt: timestamp("hand_raised_at", { withTimezone: true, precision: 3 }),
    shareRequestedAt: timestamp("share_requested_at", { withTimezone: true, precision: 3 }),
    /** A join token holds a seat until this time unless LiveKit reports the participant connected. */
    reservedUntil: timestamp("reserved_until", { withTimezone: true, precision: 3 }),
    connectedAt: timestamp("connected_at", { withTimezone: true, precision: 3 }),
    leftAt: timestamp("left_at", { withTimezone: true, precision: 3 }),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.userId] }), index("meeting_participants_user_idx").on(t.userId)]
);

export type Meeting = typeof meetings.$inferSelect;

/* ------------------ Phase 6: shared state, lounge, presentations ------------------ */

/** Server-authoritative shared state with a version for optimistic concurrency. */
export const sharedState = pgTable("shared_state", {
  key: text("key").primaryKey(),
  version: integer("version").notNull().default(0),
  state: jsonb("state").notNull().default({}),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
});

export const musicRequestStatusEnum = pgEnum("music_request_status", ["pending", "queued", "rejected", "played", "removed"]);

export const musicRequests = pgTable(
  "music_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Exactly one of fileId (uploaded audio) and youtubeId is set (CHECK music_requests_one_source). */
    fileId: uuid("file_id").references(() => files.id, { onDelete: "cascade" }),
    youtubeId: text("youtube_id"),
    /** Title for YouTube tracks (from YouTube's oEmbed); file tracks use the file name. */
    title: text("title").notNull().default(""),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    status: musicRequestStatusEnum("status").notNull().default("pending"),
    note: text("note").notNull().default(""),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    position: integer("position"),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true, precision: 3 }),
  },
  (t) => [index("music_requests_status_idx").on(t.status, t.position), index("music_requests_file_idx").on(t.fileId)]
);

export const djGrants = pgTable(
  "dj_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, precision: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [index("dj_grants_user_idx").on(t.userId)]
);

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, precision: 3 }),
  },
  (t) => [index("announcements_created_idx").on(t.createdAt)]
);

/** Workspace-wide activity feed. Never contains private-conversation events. */
export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt)]
);

/* ------------------------------ Phase 7: polls ------------------------------ */

/** Polls live in a channel or conversation and inherit its access rules. */
export const polls = pgTable(
  "polls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    question: text("question").notNull(),
    options: jsonb("options").$type<string[]>().notNull(),
    multiple: boolean("multiple").notNull().default(false),
    anonymous: boolean("anonymous").notNull().default(false),
    closesAt: timestamp("closes_at", { withTimezone: true, precision: 3 }),
    closedAt: timestamp("closed_at", { withTimezone: true, precision: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [index("polls_channel_idx").on(t.channelId, t.createdAt), index("polls_conversation_idx").on(t.conversationId, t.createdAt)]
);

export const pollVotes = pgTable(
  "poll_votes",
  {
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    option: integer("option").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.userId, t.option] }), index("poll_votes_user_idx").on(t.userId)]
);

/* --------------------------- Profiles, to-dos, meeting requests --------------------------- */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** Profile photos (at most 200 KB each, compressed in the browser), served by the backend. */
export const userAvatars = pgTable("user_avatars", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
});

export const taskVisibilityEnum = pgEnum("task_visibility", ["public", "admin"]);

/** Shared to-do list: public items are visible to and editable by every member; admin items only by admins. */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    visibility: taskVisibilityEnum("visibility").notNull().default("public"),
    highlight: boolean("highlight").notNull().default(false),
    dueAt: timestamp("due_at", { withTimezone: true, precision: 3 }),
    doneAt: timestamp("done_at", { withTimezone: true, precision: 3 }),
    doneBy: uuid("done_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    meetingRequestId: uuid("meeting_request_id"),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [index("tasks_visibility_idx").on(t.visibility, t.doneAt), index("tasks_created_by_idx").on(t.createdBy)]
);

export const meetingRequestKindEnum = pgEnum("meeting_request_kind", ["meeting", "coffee"]);
export const meetingRequestStatusEnum = pgEnum("meeting_request_status", ["pending", "approved", "declined", "cancelled"]);

/** A member asks the administrator for a meeting or a coffee at a time picked on the calendar. */
export const meetingRequests = pgTable(
  "meeting_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: meetingRequestKindEnum("kind").notNull().default("meeting"),
    topic: text("topic").notNull(),
    message: text("message").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true, precision: 3 }).notNull(),
    durationMin: integer("duration_min").notNull(),
    status: meetingRequestStatusEnum("status").notNull().default("pending"),
    decisionNote: text("decision_note").notNull().default(""),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true, precision: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [index("meeting_requests_status_idx").on(t.status, t.startsAt), index("meeting_requests_user_idx").on(t.requestedBy)]
);
