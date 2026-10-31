import {
  bigint,
  boolean,
  index,
  int,
  json,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 意见反馈：桌面版和网页版设置页「意见反馈」发来的内容。不存 IP。
 * 写入后给项目所有者发 Manus 通知，notified 记录通知是否发出。
 */
export const feedback = mysqlTable("feedback", {
  id: int("id").autoincrement().primaryKey(),
  kind: mysqlEnum("kind", ["bug", "idea", "other"]).notNull(),
  content: text("content").notNull(),
  contact: varchar("contact", { length: 60 }),
  appVersion: varchar("appVersion", { length: 32 }).notNull(),
  platform: mysqlEnum("platform", ["win", "mac", "web"]).notNull(),
  lang: varchar("lang", { length: 8 }).notNull(),
  notified: boolean("notified").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = typeof feedback.$inferInsert;

/** 亲友团的基本资料和递增变更序号。邀请码需要让管理员直接读取，因此明文保存。 */
export const teams = mysqlTable(
  "teams",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    inviteCode: varchar("inviteCode", { length: 16 }).notNull(),
    seq: bigint("seq", { mode: "number" }).default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("teams_inviteCode_unique").on(table.inviteCode)]
);

/** 亲友团成员。removedAt 不为空表示成员已移除，但保留其历史资料。 */
export const members = mysqlTable(
  "members",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    teamId: varchar("teamId", { length: 32 }).notNull(),
    nickname: varchar("nickname", { length: 48 }).notNull(),
    nicknameKey: varchar("nicknameKey", { length: 48 }).notNull(),
    role: mysqlEnum("role", ["admin", "editor", "viewer"]).notNull(),
    color: varchar("color", { length: 32 }).notNull(),
    avatar: json("avatar"),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    removedAt: timestamp("removedAt"),
  },
  table => [
    index("members_teamId_removedAt_idx").on(table.teamId, table.removedAt),
    index("members_teamId_nicknameKey_idx").on(table.teamId, table.nicknameKey),
  ]
);

/** 设备令牌只存 SHA-256 摘要，原始令牌仅在创建或登录成功时返回一次。 */
export const deviceTokens = mysqlTable(
  "device_tokens",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    memberId: varchar("memberId", { length: 32 }).notNull(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    platform: mysqlEnum("platform", ["win", "mac"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
  },
  table => [
    uniqueIndex("device_tokens_tokenHash_unique").on(table.tokenHash),
    index("device_tokens_memberId_idx").on(table.memberId),
  ]
);

/** 登录码的摘要。旧的未使用码在生成新码时立即失效。 */
export const loginCodes = mysqlTable(
  "login_codes",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    memberId: varchar("memberId", { length: 32 }).notNull(),
    codeHash: varchar("codeHash", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("login_codes_memberId_idx").on(table.memberId),
    index("login_codes_codeHash_idx").on(table.codeHash),
  ]
);

/** 团队同步的条目。删除后保留墓碑，以便其他设备在增量同步时清理本地数据。 */
export const entities = mysqlTable(
  "entities",
  {
    teamId: varchar("teamId", { length: 32 }).notNull(),
    kind: mysqlEnum("kind", [
      "scheme",
      "character",
      "raidLog",
      "blacklist",
      "link",
      "loadout",
      "note",
    ]).notNull(),
    entityId: varchar("entityId", { length: 96 }).notNull(),
    ownerId: varchar("ownerId", { length: 32 }).notNull(),
    visibility: mysqlEnum("visibility", ["team", "private"]).notNull(),
    version: int("version").notNull(),
    data: mediumtext("data").notNull(),
    deleted: boolean("deleted").default(false).notNull(),
    seq: bigint("seq", { mode: "number" }).notNull(),
    updatedBy: varchar("updatedBy", { length: 32 }).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("entities_team_kind_entity_unique").on(
      table.teamId,
      table.kind,
      table.entityId
    ),
    index("entities_team_seq_idx").on(table.teamId, table.seq),
  ]
);

/** 已上传的团队图片，用于追踪归属和后续清理。 */
export const teamFiles = mysqlTable(
  "team_files",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    teamId: varchar("teamId", { length: 32 }).notNull(),
    memberId: varchar("memberId", { length: 32 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    mime: varchar("mime", { length: 64 }).notNull(),
    bytes: int("bytes").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("team_files_teamId_idx").on(table.teamId),
    index("team_files_memberId_createdAt_idx").on(table.memberId, table.createdAt),
  ]
);
