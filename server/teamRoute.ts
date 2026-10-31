import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { and, asc, eq, gt, isNull, ne } from "drizzle-orm";
import {
  deviceTokens,
  entities,
  loginCodes,
  members,
  teamFiles,
  teams,
} from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";
import {
  TEAM_LIMITS,
  nicknameKey,
  type AuthResult,
  type EntityRecord,
  type PushResult,
  type TeamErrorCode,
  type TeamInfo,
  type TeamRole,
} from "@shared/teamApi";
import {
  TeamRateLimiter,
  pickClientIp,
  sniffImageType,
  canWriteEntity,
  entityRecord,
  entityVisibility,
  generateInviteCode,
  generateLoginCode,
  generateToken,
  parseCreateRequest,
  parseEntityChange,
  parseJoinRequest,
  parseLoginRequest,
  parseMemberPatch,
  parseTeamName,
  randomId,
  sha256,
  teamMember,
  visibleEntity,
  type EntityRow,
  type ParsedEntityChange,
} from "./team";

const DESKTOP_ORIGINS = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
]);

const createLimiter = new TeamRateLimiter();
const joinLimiter = new TeamRateLimiter();
const loginLimiter = new TeamRateLimiter();
const fileLimiter = new TeamRateLimiter();
const pushLimiter = new TeamRateLimiter();

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type TeamAuth = {
  tokenId: string;
  lastSeenAt: Date;
  member: {
    id: string;
    teamId: string;
    nickname: string;
    role: TeamRole;
    color: string;
    avatar: unknown;
    joinedAt: Date;
  };
  team: {
    id: string;
    name: string;
    inviteCode: string;
    seq: number;
  };
};

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/** 把异步路由错误交给本模块的 JSON 错误处理器。 */
function asyncRoute(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

/** 取限流用的 IP（见 pickClientIp）。 */
function clientIp(req: Request) {
  return pickClientIp(req.headers, req.socket.remoteAddress);
}

/** 只向桌面端来源发送跨域头。 */
function cors(req: Request, res: Response) {
  const origin = req.headers.origin;
  if (!origin || !DESKTOP_ORIGINS.has(origin)) return;
  res.set({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
}

function sendError(res: Response, status: number, error: TeamErrorCode, message: string, retryAfter?: number) {
  if (retryAfter !== undefined) res.set("Retry-After", String(retryAfter));
  res.status(status).json({ error, message, ...(retryAfter !== undefined ? { retryAfter } : {}) });
}

function takeRateLimit(res: Response, limiter: TeamRateLimiter, key: string, limit: number, windowMs: number) {
  const retryAfter = limiter.take(key, limit, windowMs);
  if (!retryAfter) return true;
  sendError(res, 429, "rate_limited", "操作太频繁", retryAfter);
  return false;
}

function teamInfo(team: TeamAuth["team"], role: TeamRole): TeamInfo {
  return {
    id: team.id,
    name: team.name,
    inviteCode: role === "admin" ? team.inviteCode : null,
  };
}

function memberInfo(auth: TeamAuth) {
  return teamMember(auth.member);
}

async function activeTeamMembers(db: Database, teamId: string) {
  const rows = await db
    .select()
    .from(members)
    .where(and(eq(members.teamId, teamId), isNull(members.removedAt)))
    .orderBy(asc(members.joinedAt));
  return rows.map(teamMember);
}

async function authResult(db: Database, auth: TeamAuth, token: string): Promise<AuthResult> {
  return {
    token,
    memberId: auth.member.id,
    team: teamInfo(auth.team, auth.member.role),
    members: await activeTeamMembers(db, auth.team.id),
  };
}

function duplicateKey(error: unknown) {
  return String(error).toLowerCase().includes("duplicate");
}

function fileExtension(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  return "webp";
}

async function authenticate(req: Request, res: Response): Promise<TeamAuth | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    sendError(res, 401, "unauthorized", "登录已失效");
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    sendError(res, 401, "unauthorized", "登录已失效");
    return null;
  }
  const db = await getDb();
  if (!db) {
    sendError(res, 503, "server_error", "服务暂不可用");
    return null;
  }
  const found = await db
    .select({
      tokenId: deviceTokens.id,
      lastSeenAt: deviceTokens.lastSeenAt,
      memberId: members.id,
      memberTeamId: members.teamId,
      nickname: members.nickname,
      role: members.role,
      color: members.color,
      avatar: members.avatar,
      joinedAt: members.joinedAt,
      teamId: teams.id,
      teamName: teams.name,
      inviteCode: teams.inviteCode,
      seq: teams.seq,
    })
    .from(deviceTokens)
    .innerJoin(members, eq(deviceTokens.memberId, members.id))
    .innerJoin(teams, eq(members.teamId, teams.id))
    .where(and(eq(deviceTokens.tokenHash, sha256(token)), isNull(deviceTokens.revokedAt), isNull(members.removedAt)))
    .limit(1);
  const row = found[0];
  if (!row) {
    sendError(res, 401, "unauthorized", "登录已失效");
    return null;
  }
  const auth: TeamAuth = {
    tokenId: row.tokenId,
    lastSeenAt: row.lastSeenAt,
    member: {
      id: row.memberId,
      teamId: row.memberTeamId,
      nickname: row.nickname,
      role: row.role,
      color: row.color,
      avatar: row.avatar,
      joinedAt: row.joinedAt,
    },
    team: {
      id: row.teamId,
      name: row.teamName,
      inviteCode: row.inviteCode,
      seq: Number(row.seq),
    },
  };
  // 令牌最后活动时间只每分钟落库一次，避免每次拉取同步都写数据库。
  if (Date.now() - new Date(auth.lastSeenAt).getTime() >= 60_000) {
    await db
      .update(deviceTokens)
      .set({ lastSeenAt: new Date() })
      .where(eq(deviceTokens.id, auth.tokenId));
  }
  return auth;
}

function requireAuth(handler: (req: Request, res: Response, auth: TeamAuth) => Promise<void>) {
  return asyncRoute(async (req, res) => {
    const auth = await authenticate(req, res);
    if (!auth) return;
    await handler(req, res, auth);
  });
}

/** 单次条目写入。每项调用方都会在独立事务中调用此函数。 */
async function pushOne(db: Database, auth: TeamAuth, change: ParsedEntityChange): Promise<PushResult> {
  return db.transaction(async tx => {
    // 在事务里重新读一次成员：请求进来后才被移除或降权的，不能再写
    const actorRows = await tx
      .select({ role: members.role, removedAt: members.removedAt })
      .from(members)
      .where(and(eq(members.id, auth.member.id), eq(members.teamId, auth.team.id)))
      .for("update");
    const actor = actorRows[0];
    if (!actor || actor.removedAt) {
      return { kind: change.kind, id: change.id, ok: false, error: "forbidden", message: "没有权限" };
    }
    const existingRows = await tx
      .select()
      .from(entities)
      .where(and(eq(entities.teamId, auth.team.id), eq(entities.kind, change.kind), eq(entities.entityId, change.id)))
      .for("update");
    const existing = existingRows[0] ?? null;
    if (!existing && change.deleted) {
      // 删除服务器上本来就没有的条目：什么都不写，免得留下删除标记占住这个 ID
      return { kind: change.kind, id: change.id, ok: true, version: 0, seq: Number(auth.team.seq) };
    }
    if (!canWriteEntity({ kind: change.kind, role: actor.role, actorId: auth.member.id, existing, deleted: change.deleted })) {
      return { kind: change.kind, id: change.id, ok: false, error: "forbidden", message: "没有权限" };
    }
    if (change.kind === "scheme" && ((existing && change.baseVersion !== existing.version) || (!existing && change.baseVersion > 0))) {
      return {
        kind: change.kind,
        id: change.id,
        ok: false,
        error: "conflict",
        message: "方案已被修改",
        ...(existing ? { current: entityRecord(existing as EntityRow) } : {}),
      };
    }
    const teamRows = await tx.select().from(teams).where(eq(teams.id, auth.team.id)).for("update");
    const team = teamRows[0];
    if (!team) throw new Error("Team disappeared during push");
    const seq = Number(team.seq) + 1;
    const ownerId = existing?.deleted && !change.deleted && existing.updatedBy === existing.ownerId
      ? auth.member.id
      : existing?.ownerId ?? auth.member.id;
    const now = new Date();
    const version = (existing?.version ?? 0) + 1;
    const values = {
      teamId: auth.team.id,
      kind: change.kind,
      entityId: change.id,
      ownerId,
      visibility: entityVisibility(change.kind, change.visibility),
      version,
      data: change.deleted ? "null" : change.dataJson,
      deleted: change.deleted,
      seq,
      updatedBy: auth.member.id,
      updatedAt: now,
    };
    await tx.update(teams).set({ seq }).where(eq(teams.id, auth.team.id));
    await tx.insert(entities).values(values).onDuplicateKeyUpdate({
      set: {
        ownerId: values.ownerId,
        visibility: values.visibility,
        version: values.version,
        data: values.data,
        deleted: values.deleted,
        seq: values.seq,
        updatedBy: values.updatedBy,
        updatedAt: values.updatedAt,
      },
    });
    return { kind: change.kind, id: change.id, ok: true, version, seq };
  });
}

/** 必须在全局 50 MB JSON 解析器之前注册，才能保留团队接口各自的上限。 */
export function registerTeamRoutes(app: Express) {
  app.use("/api/team", (req, res, next) => {
    cors(req, res);
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.post(
    "/api/team/create",
    express.json({ limit: "64kb" }),
    asyncRoute(async (req, res) => {
      if (!takeRateLimit(res, createLimiter, clientIp(req), 5, 60 * 60 * 1000)) return;
      const input = parseCreateRequest(req.body);
      if (!input) {
        sendError(res, 400, "invalid", "请求内容不对");
        return;
      }
      const db = await getDb();
      if (!db) {
        sendError(res, 503, "server_error", "服务暂不可用");
        return;
      }
      for (let attempt = 0; attempt < 8; attempt++) {
        const inviteCode = generateInviteCode();
        const token = generateToken();
        const memberId = randomId();
        const teamId = randomId();
        try {
          const created = await db.transaction(async tx => {
            const now = new Date();
            await tx.insert(teams).values({ id: teamId, name: input.teamName, inviteCode, seq: 0, createdAt: now });
            await tx.insert(members).values({
              id: memberId,
              teamId,
              nickname: input.nickname,
              nicknameKey: input.nicknameKey,
              role: "admin",
              color: input.color,
              avatar: input.avatar,
              joinedAt: now,
            });
            await tx.insert(deviceTokens).values({
              id: randomId(),
              memberId,
              tokenHash: sha256(token),
              platform: input.platform,
              createdAt: now,
              lastSeenAt: now,
            });
            return {
              tokenId: "",
              lastSeenAt: now,
              member: { id: memberId, teamId, nickname: input.nickname, role: "admin" as const, color: input.color, avatar: input.avatar, joinedAt: now },
              team: { id: teamId, name: input.teamName, inviteCode, seq: 0 },
            } satisfies TeamAuth;
          });
          res.status(201).json(await authResult(db, created, token));
          return;
        } catch (error) {
          if (!duplicateKey(error) || attempt === 7) throw error;
        }
      }
    })
  );

  app.post(
    "/api/team/join",
    express.json({ limit: "64kb" }),
    asyncRoute(async (req, res) => {
      if (!takeRateLimit(res, joinLimiter, clientIp(req), 10, 10 * 60 * 1000)) return;
      const input = parseJoinRequest(req.body);
      if (!input) {
        sendError(res, 400, "invalid", "请求内容不对");
        return;
      }
      const db = await getDb();
      if (!db) {
        sendError(res, 503, "server_error", "服务暂不可用");
        return;
      }
      const token = generateToken();
      const joined = await db.transaction(async tx => {
        const teamRows = await tx.select().from(teams).where(eq(teams.inviteCode, input.inviteCode)).for("update");
        const team = teamRows[0];
        if (!team) return { state: "invite_invalid" as const };
        const sameName = await tx
          .select({ id: members.id })
          .from(members)
          .where(and(eq(members.teamId, team.id), eq(members.nicknameKey, input.nicknameKey), isNull(members.removedAt)))
          .limit(1);
        if (sameName[0]) return { state: "nickname_taken" as const };
        const now = new Date();
        const memberId = randomId();
        await tx.insert(members).values({
          id: memberId,
          teamId: team.id,
          nickname: input.nickname,
          nicknameKey: input.nicknameKey,
          role: "viewer",
          color: input.color,
          avatar: input.avatar,
          joinedAt: now,
        });
        await tx.insert(deviceTokens).values({
          id: randomId(),
          memberId,
          tokenHash: sha256(token),
          platform: input.platform,
          createdAt: now,
          lastSeenAt: now,
        });
        return {
          state: "ok" as const,
          auth: {
            tokenId: "",
            lastSeenAt: now,
            member: { id: memberId, teamId: team.id, nickname: input.nickname, role: "viewer" as const, color: input.color, avatar: input.avatar, joinedAt: now },
            team: { id: team.id, name: team.name, inviteCode: team.inviteCode, seq: Number(team.seq) },
          } satisfies TeamAuth,
        };
      });
      if (joined.state === "invite_invalid") {
        sendError(res, 404, "invite_invalid", "邀请码不对");
        return;
      }
      if (joined.state === "nickname_taken") {
        sendError(res, 409, "nickname_taken", "这个昵称已经有人用了");
        return;
      }
      res.status(201).json(await authResult(db, joined.auth, token));
    })
  );

  app.post(
    "/api/team/login",
    express.json({ limit: "64kb" }),
    asyncRoute(async (req, res) => {
      if (!takeRateLimit(res, loginLimiter, clientIp(req), 10, 10 * 60 * 1000)) return;
      const input = parseLoginRequest(req.body);
      if (!input) {
        sendError(res, 404, "code_invalid", "登录码不对或已过期");
        return;
      }
      const db = await getDb();
      if (!db) {
        sendError(res, 503, "server_error", "服务暂不可用");
        return;
      }
      const token = generateToken();
      const loggedIn = await db.transaction(async tx => {
        const codeRows = await tx
          .select()
          .from(loginCodes)
          .where(and(eq(loginCodes.codeHash, sha256(input.code)), isNull(loginCodes.usedAt), gt(loginCodes.expiresAt, new Date())))
          .for("update");
        // 只认唯一一条没用过、没过期的码；万一撞码（概率极低）两边都不放行
        const code = codeRows.length === 1 ? codeRows[0] : null;
        if (!code) return null;
        const memberRows = await tx.select().from(members).where(eq(members.id, code.memberId)).for("update");
        const member = memberRows[0];
        if (!member || member.removedAt) return null;
        const teamRows = await tx.select().from(teams).where(eq(teams.id, member.teamId)).limit(1);
        const team = teamRows[0];
        if (!team) return null;
        const now = new Date();
        await tx.update(loginCodes).set({ usedAt: now }).where(eq(loginCodes.id, code.id));
        await tx.insert(deviceTokens).values({
          id: randomId(),
          memberId: member.id,
          tokenHash: sha256(token),
          platform: input.platform,
          createdAt: now,
          lastSeenAt: now,
        });
        return {
          tokenId: "",
          lastSeenAt: now,
          member: { id: member.id, teamId: member.teamId, nickname: member.nickname, role: member.role, color: member.color, avatar: member.avatar, joinedAt: member.joinedAt },
          team: { id: team.id, name: team.name, inviteCode: team.inviteCode, seq: Number(team.seq) },
        } satisfies TeamAuth;
      });
      if (!loggedIn) {
        sendError(res, 404, "code_invalid", "登录码不对或已过期");
        return;
      }
      res.json(await authResult(db, loggedIn, token));
    })
  );

  app.post("/api/team/logout", express.json({ limit: "64kb" }), requireAuth(async (_req, res, auth) => {
    const db = await getDb();
    if (!db) {
      sendError(res, 503, "server_error", "服务暂不可用");
      return;
    }
    await db.update(deviceTokens).set({ revokedAt: new Date() }).where(eq(deviceTokens.id, auth.tokenId));
    res.json({ ok: true });
  }));

  app.post("/api/team/login-code", express.json({ limit: "64kb" }), requireAuth(async (req, res, auth) => {
    const db = await getDb();
    if (!db) {
      sendError(res, 503, "server_error", "服务暂不可用");
      return;
    }
    // 默认给自己生成；管理员可以给别的成员生成（成员换电脑、设备丢了时用）
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
    let targetId = auth.member.id;
    if (body.memberId !== undefined && body.memberId !== auth.member.id) {
      if (typeof body.memberId !== "string" || !body.memberId) {
        sendError(res, 400, "invalid", "请求内容不对");
        return;
      }
      if (auth.member.role !== "admin") {
        sendError(res, 403, "forbidden", "没有权限");
        return;
      }
      const target = await db
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.id, body.memberId), eq(members.teamId, auth.team.id), isNull(members.removedAt)))
        .limit(1);
      if (!target[0]) {
        sendError(res, 404, "not_found", "成员不存在");
        return;
      }
      targetId = body.memberId;
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateLoginCode();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TEAM_LIMITS.loginCodeMinutes * 60 * 1000);
      try {
        await db.transaction(async tx => {
          await tx.update(loginCodes).set({ usedAt: now }).where(and(eq(loginCodes.memberId, targetId), isNull(loginCodes.usedAt)));
          await tx.insert(loginCodes).values({ id: randomId(), memberId: targetId, codeHash: sha256(code.replace(/-/g, "")), expiresAt, createdAt: now });
        });
        res.json({ code, expiresAt: expiresAt.toISOString() });
        return;
      } catch (error) {
        if (!duplicateKey(error) || attempt === 7) throw error;
      }
    }
  }));

  app.get("/api/team/sync", requireAuth(async (req, res, auth) => {
    const rawSince = req.query.since;
    if (typeof rawSince !== "string" || !/^\d+$/.test(rawSince) || !Number.isSafeInteger(Number(rawSince))) {
      sendError(res, 400, "invalid", "同步序号不对");
      return;
    }
    const since = Number(rawSince);
    const db = await getDb();
    if (!db) {
      sendError(res, 503, "server_error", "服务暂不可用");
      return;
    }
    const conditions = [eq(entities.teamId, auth.team.id)];
    if (since > 0) conditions.push(gt(entities.seq, since));
    else conditions.push(eq(entities.deleted, false));
    const [entityRows, memberRows, teamRows] = await Promise.all([
      db.select().from(entities).where(and(...conditions)).orderBy(asc(entities.seq)),
      db.select().from(members).where(and(eq(members.teamId, auth.team.id), isNull(members.removedAt))).orderBy(asc(members.joinedAt)),
      db.select().from(teams).where(eq(teams.id, auth.team.id)).limit(1),
    ]);
    const team = teamRows[0] ?? auth.team;
    const teamForResponse: TeamAuth["team"] = { id: team.id, name: team.name, inviteCode: team.inviteCode, seq: Number(team.seq) };
    const visible = entityRows
      .map(row => visibleEntity(row as EntityRow, auth.member.id, since > 0))
      .filter((row): row is EntityRecord => row !== null);
    res.json({
      seq: Number(team.seq),
      team: teamInfo(teamForResponse, auth.member.role),
      me: { memberId: auth.member.id, role: auth.member.role, nickname: auth.member.nickname },
      members: memberRows.map(teamMember),
      entities: visible,
    });
  }));

  app.post(
    "/api/team/push",
    express.json({ limit: "4mb" }),
    requireAuth(async (req, res, auth) => {
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray((body as Record<string, unknown>).changes)) {
        sendError(res, 400, "invalid", "请求内容不对");
        return;
      }
      const changes = (body as { changes: unknown[] }).changes;
      if (changes.length < 1 || changes.length > TEAM_LIMITS.pushBatch) {
        sendError(res, 400, "invalid", "修改数量不对");
        return;
      }
      // 正常使用：改动 1.5 秒后推一次，每次最多 50 条。每分钟 120 次足够，挡住刷库
      if (!takeRateLimit(res, pushLimiter, auth.member.id, 120, 60 * 1000)) return;
      const db = await getDb();
      if (!db) {
        sendError(res, 503, "server_error", "服务暂不可用");
        return;
      }
      const results: PushResult[] = [];
      for (const rawChange of changes) {
        const parsed = parseEntityChange(rawChange);
        if (!parsed.ok) {
          results.push({ kind: parsed.kind, id: parsed.id, ok: false, error: parsed.error, message: parsed.message });
          continue;
        }
        results.push(await pushOne(db, auth, parsed.value));
      }
      const latest = await db.select({ seq: teams.seq }).from(teams).where(eq(teams.id, auth.team.id)).limit(1);
      res.json({ seq: Number(latest[0]?.seq ?? auth.team.seq), results });
    })
  );

  app.patch(
    "/api/team/members/:id",
    express.json({ limit: "64kb" }),
    requireAuth(async (req, res, auth) => {
      const patch = parseMemberPatch(req.body);
      if (!patch) {
        sendError(res, 400, "invalid", "请求内容不对");
        return;
      }
      const targetId = req.params.id;
      if (!targetId) {
        sendError(res, 404, "not_found", "成员不存在");
        return;
      }
      if (patch.role !== undefined && auth.member.role !== "admin") {
        sendError(res, 403, "forbidden", "没有权限");
        return;
      }
      const changesOwnProfile = patch.nickname !== undefined || patch.color !== undefined || patch.avatar !== undefined;
      if (changesOwnProfile && targetId !== auth.member.id) {
        sendError(res, 403, "forbidden", "没有权限");
        return;
      }
      const db = await getDb();
      if (!db) {
        sendError(res, 503, "server_error", "服务暂不可用");
        return;
      }
      const result = await db.transaction(async tx => {
        // 用团队行串行化昵称检查，补足 MySQL 无法表达的“未移除成员唯一”约束。
        await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, auth.team.id)).for("update");
        const targetRows = await tx
          .select()
          .from(members)
          .where(and(eq(members.id, targetId), eq(members.teamId, auth.team.id), isNull(members.removedAt)))
          .for("update");
        const target = targetRows[0];
        if (!target) return { state: "not_found" as const };
        if (patch.role !== undefined && target.role === "admin" && patch.role !== "admin") {
          const admins = await tx
            .select({ id: members.id })
            .from(members)
            .where(and(eq(members.teamId, auth.team.id), eq(members.role, "admin"), isNull(members.removedAt)));
          if (admins.length <= 1) return { state: "last_admin" as const };
        }
        const nextNickname = patch.nickname ?? target.nickname;
        if (patch.nickname !== undefined) {
          const duplicate = await tx
            .select({ id: members.id })
            .from(members)
            .where(and(eq(members.teamId, auth.team.id), eq(members.nicknameKey, nicknameKey(patch.nickname)), isNull(members.removedAt), ne(members.id, targetId)))
            .limit(1);
          if (duplicate[0]) return { state: "nickname_taken" as const };
        }
        const values = {
          ...(patch.role !== undefined ? { role: patch.role } : {}),
          ...(patch.nickname !== undefined ? { nickname: nextNickname, nicknameKey: nicknameKey(nextNickname) } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...(patch.avatar !== undefined ? { avatar: patch.avatar } : {}),
        };
        await tx.update(members).set(values).where(eq(members.id, targetId));
        return {
          state: "ok" as const,
          member: {
            ...target,
            ...values,
            nickname: values.nickname ?? target.nickname,
            nicknameKey: values.nicknameKey ?? target.nicknameKey,
            role: values.role ?? target.role,
            color: values.color ?? target.color,
            avatar: patch.avatar !== undefined ? patch.avatar : target.avatar,
          },
        };
      });
      if (result.state === "not_found") {
        sendError(res, 404, "not_found", "成员不存在");
        return;
      }
      if (result.state === "last_admin") {
        sendError(res, 409, "last_admin", "至少要保留一个管理员");
        return;
      }
      if (result.state === "nickname_taken") {
        sendError(res, 409, "nickname_taken", "这个昵称已经有人用了");
        return;
      }
      res.json({ member: teamMember(result.member) });
    })
  );

  app.delete("/api/team/members/:id", requireAuth(async (req, res, auth) => {
    if (auth.member.role !== "admin") {
      sendError(res, 403, "forbidden", "没有权限");
      return;
    }
    const targetId = req.params.id;
    if (!targetId) {
      sendError(res, 404, "not_found", "成员不存在");
      return;
    }
    if (targetId === auth.member.id) {
      sendError(res, 403, "forbidden", "不能移除自己");
      return;
    }
    const db = await getDb();
    if (!db) {
      sendError(res, 503, "server_error", "服务暂不可用");
      return;
    }
    const target = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.id, targetId), eq(members.teamId, auth.team.id), isNull(members.removedAt)))
      .limit(1);
    if (!target[0]) {
      sendError(res, 404, "not_found", "成员不存在");
      return;
    }
    const now = new Date();
    await db.transaction(async tx => {
      const teamRows = await tx.select({ seq: teams.seq }).from(teams).where(eq(teams.id, auth.team.id)).for("update");
      let seq = Number(teamRows[0]?.seq ?? 0);
      await tx.update(members).set({ removedAt: now }).where(eq(members.id, targetId));
      await tx.update(deviceTokens).set({ revokedAt: now }).where(and(eq(deviceTokens.memberId, targetId), isNull(deviceTokens.revokedAt)));
      // 被移除成员的角色一起删掉；其他人下次同步时收到删除
      const chars = await tx
        .select({ entityId: entities.entityId, version: entities.version })
        .from(entities)
        .where(and(eq(entities.teamId, auth.team.id), eq(entities.kind, "character"), eq(entities.ownerId, targetId), eq(entities.deleted, false)))
        .for("update");
      for (const c of chars) {
        seq += 1;
        await tx
          .update(entities)
          .set({ deleted: true, data: "null", version: c.version + 1, seq, updatedBy: auth.member.id, updatedAt: now })
          .where(and(eq(entities.teamId, auth.team.id), eq(entities.kind, "character"), eq(entities.entityId, c.entityId)));
      }
      if (chars.length) await tx.update(teams).set({ seq }).where(eq(teams.id, auth.team.id));
    });
    res.json({ ok: true });
  }));

  app.post("/api/team/invite/reset", express.json({ limit: "64kb" }), requireAuth(async (_req, res, auth) => {
    if (auth.member.role !== "admin") {
      sendError(res, 403, "forbidden", "没有权限");
      return;
    }
    const db = await getDb();
    if (!db) {
      sendError(res, 503, "server_error", "服务暂不可用");
      return;
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const inviteCode = generateInviteCode();
      try {
        await db.update(teams).set({ inviteCode }).where(eq(teams.id, auth.team.id));
        res.json({ inviteCode });
        return;
      } catch (error) {
        if (!duplicateKey(error) || attempt === 7) throw error;
      }
    }
  }));

  app.patch("/api/team", express.json({ limit: "64kb" }), requireAuth(async (req, res, auth) => {
    if (auth.member.role !== "admin") {
      sendError(res, 403, "forbidden", "没有权限");
      return;
    }
    const name = parseTeamName(req.body);
    if (!name) {
      sendError(res, 400, "invalid", "亲友团名称不对");
      return;
    }
    const db = await getDb();
    if (!db) {
      sendError(res, 503, "server_error", "服务暂不可用");
      return;
    }
    await db.update(teams).set({ name }).where(eq(teams.id, auth.team.id));
    res.json({ team: { id: auth.team.id, name, inviteCode: auth.team.inviteCode } });
  }));

  app.post(
    "/api/team/files",
    express.raw({ type: "*/*", limit: "2mb" }),
    requireAuth(async (req, res, auth) => {
      const typeHeader = req.headers["content-type"];
      const mime = (Array.isArray(typeHeader) ? typeHeader[0] : typeHeader)?.split(";", 1)[0]?.trim().toLowerCase();
      if (!mime || !(TEAM_LIMITS.fileTypes as readonly string[]).includes(mime)) {
        sendError(res, 400, "invalid", "图片类型不支持");
        return;
      }
      if (!Buffer.isBuffer(req.body) || req.body.length > TEAM_LIMITS.fileBytes) {
        sendError(res, 413, "too_large", "图片太大");
        return;
      }
      if (sniffImageType(req.body) !== mime) {
        sendError(res, 400, "invalid", "图片类型不支持");
        return;
      }
      if (!takeRateLimit(res, fileLimiter, auth.member.id, 60, 10 * 60 * 1000)) return;
      const db = await getDb();
      if (!db) {
        sendError(res, 503, "server_error", "服务暂不可用");
        return;
      }
      const relativeKey = `team/${auth.team.id}/${randomId()}.${fileExtension(mime)}`;
      const stored = await storagePut(relativeKey, req.body, mime);
      await db.insert(teamFiles).values({
        id: randomId(),
        teamId: auth.team.id,
        memberId: auth.member.id,
        storageKey: stored.key,
        mime,
        bytes: req.body.length,
        createdAt: new Date(),
      });
      res.status(201).json({ src: `/manus-storage/${stored.key}` });
    })
  );

  // 专用解析器的错误要在全局解析器之前变成 API 约定中的 JSON。
  app.use(
    "/api/team",
    (
      error: { type?: string; status?: number },
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      if (!error) return next();
      cors(req, res);
      const tooLarge = error.type === "entity.too.large" || error.status === 413;
      if (tooLarge) {
        sendError(res, 413, "too_large", "请求内容太大");
        return;
      }
      // 请求体解析错误（body-parser 会带上 type 和 4xx 状态）才算请求不对；其他是服务器出错
      if (error.type && error.status && error.status >= 400 && error.status < 500) {
        sendError(res, 400, "invalid", "请求内容不对");
        return;
      }
      console.error("[team] 接口出错", req.method, req.path, error);
      sendError(res, 500, "server_error", "服务器出错了，稍后再试");
    }
  );
}
